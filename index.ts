/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * OIDC / OAuth2 单点登录插件（Cordis 原生插件，export default 即 activate 阶段）。
 *
 * 功能：
 *  1. 可自定义认证平台：任意 OAuth2 / OIDC（Authorization Code + userinfo），
 *     回调地址默认 /sso-callback（设置页可改，保存后重启生效）。
 *  2. 未注册用户询问是否创建站点账户（用户名/邮箱取自平台，重名自动追加
 *     _openid 后四位）；关闭自动注册后不再询问，仅允许已绑定用户登录。
 *  3. 已登录用户绑定/解绑平台账号：已安装 colorful-profiles 时在资料编辑页
 *     （/profile/edit），否则在仪表盘（/admin）提供入口。
 *
 * 与 easy-captcha / easy-2fa 兼容：
 *  - SSO 走独立回调路由（GET），不经过 /login，天然跳过人机验证；
 *  - 登录后仅写入标准会话（regenerate + userId，不标记 easy2faPassed），
 *    easy-2fa 的强制中间件会自动接手：已绑定两步验证的用户进入挑战页继续验证，
 *    严格模式下未绑定的用户被引导至绑定页；未完成验证则登录不完整（所有请求
 *    被拦回挑战/绑定页）。状态仅存会话，不耦合 easy-2fa 内部函数。
 */

import { randomBytes } from 'node:crypto';
import { Context } from 'cordis';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { checkPermission, requireAuth } from '../../services/permission.service.js';
import type { SsoConfig, SsoProvider } from './src/config.js';
import { DEFAULT_CALLBACK_PATH, exampleProvidersJson, loadConfig, normalizeConfig, parseSettingsForm, providerReady, saveConfig, validateConfig } from './src/config.js';
import { buildAuthorizeUrl, discoverOpenIdProvider, exchangeCode, extractIdentity, fetchUserInfo, generatePkce, randomState, resolveUsername, safeUsername, type SsoIdentity } from './src/oauth.js';
import type { SsoDb } from './src/store.js';
import { createBinding, ensureSchema, findBinding, listBindingsByUser, refreshBindingSnapshot, removeBindingByUserAndProvider } from './src/store.js';

const PLUGIN_ID = 'oidc-sso';
const SETTINGS_URL = '/admin/oidc-sso/settings';
const LOGIN_START_PREFIX = '/sso/login/';
const CONNECT_PREFIX = '/sso/connect/';
const DISCONNECT_PREFIX = '/sso/disconnect/';
const MANAGE_PERMISSION = 'plugin:manage';
/** 登录/绑定进行中状态与「创建账户」确认页的存活时间（分钟）。 */
const STATE_TTL_MS = 10 * 60 * 1000;

const text = (value: unknown): string => String(value ?? '').trim();
const param = (value: unknown): string => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
const messageOf = (error: unknown): string => error instanceof Error ? error.message : '操作失败';
/** 页面处理器包装：失败时渲染 error 视图（与 Base wrap 语义一致）。 */
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res, next) => {
  void Promise.resolve(fn(req, res)).catch((error) => {
    console.error(`[${PLUGIN_ID}] handler error:`, error);
    if (res.headersSent) return next(error);
    res.status(500).render('error', { title: '单点登录出错', message: messageOf(error) });
  });
};
/** JSON API 处理器包装：失败时返回 { ok:false }（与 Base JSON 约定一致）。 */
const wrapJson = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  void Promise.resolve(fn(req, res)).catch((error) => {
    console.error(`[${PLUGIN_ID}] handler error:`, error);
    if (!res.headersSent) res.status(400).json({ ok: false, message: messageOf(error) });
  });
};

/** 同源回跳地址白名单：仅允许站内路径，防止开放重定向。 */
function safeReturnPath(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return undefined;
  return raw;
}

function randomPassword(): string { return randomBytes(24).toString('base64url'); }

export default async function oidcSso(context: Context): Promise<void> {
  const { web, db, admin } = context.linearpress;
  const database = context.databaseService as unknown as SsoDb;
  const plugins = context.plugins;
  const users = context.users;

  await ensureSchema(database);
  let config: SsoConfig = loadConfig(plugins);
  const reloadConfig = (): void => { config = loadConfig(plugins); };

  const readyProvider = (id: string): SsoProvider | undefined => {
    const provider = config.providers.find((item) => item.id === id);
    return provider && providerReady(provider) ? provider : undefined;
  };
  const originOf = (req: Request): string => `${req.protocol}://${req.get('host')}`;
  const redirectUriFor = (req: Request): string => `${originOf(req)}${config.callbackPath}`;

  admin.registerMenu({ title: '单点登录', link: SETTINGS_URL, icon: '🔐' });

  // ---------------------------------------------------------------- 公开接口

  web.register('get', '/sso/providers', wrapJson(async (_req, res) => {
    res.json({
      ok: true,
      autoRegister: config.autoRegister,
      providers: config.providers.filter(providerReady).map((provider) => ({ id: provider.id, name: provider.name, icon: provider.icon }))
    });
  }));

  // 发起单点登录：GET /sso/login/:provider?redirect=/站点内路径
  web.register('get', `${LOGIN_START_PREFIX}:provider`, wrap(async (req, res) => {
    const provider = readyProvider(param(req.params.provider));
    if (!provider) {
      return void res.status(400).render('auth/login', { title: '登录', error: '该认证平台不存在或未配置完成。' });
    }
    const state = randomState();
    const pkce = provider.usePkce ? generatePkce() : undefined;
    req.session.ssoPending = {
      state,
      provider: provider.id,
      intent: 'login',
      returnTo: safeReturnPath(req.query.redirect) ?? '/admin',
      verifier: pkce?.verifier,
      exp: Date.now() + STATE_TTL_MS
    };
    res.redirect(buildAuthorizeUrl(provider, redirectUriFor(req), state, pkce?.challenge));
  }));

  // 回调：GET <callbackPath>（默认 /sso-callback；可配置，保存后重启生效）
  web.register('get', config.callbackPath, wrap(async (req, res) => {
    const pending = req.session.ssoPending;
    req.session.ssoPending = undefined;
    if (text(req.query.error)) {
      return void res.status(400).render('error', { title: '单点登录已取消', message: '你在认证平台取消或拒绝了授权。' });
    }
    const state = param(req.query.state);
    const code = param(req.query.code);
    if (!pending || !pending.state || pending.state !== state || Date.now() > pending.exp) {
      return void res.status(400).render('error', { title: '登录状态已失效', message: '单点登录状态已过期或与请求不匹配，请重新发起登录。' });
    }
    const provider = readyProvider(pending.provider);
    if (!provider) {
      return void res.status(400).render('error', { title: '认证平台不可用', message: '该认证平台已被删除或停用，请联系管理员。' });
    }
    // 换取令牌并获取用户信息
    const token = await exchangeCode(provider, code, redirectUriFor(req), pending.verifier);
    const info = await fetchUserInfo(provider, String(token.access_token ?? ''));
    const identity = extractIdentity(provider, info);

    if (pending.intent === 'bind') return void (await handleBindCallback(req, res, provider, identity, pending.returnTo ?? '/admin'));
    await handleLoginCallback(req, res, provider, identity, pending.returnTo ?? '/admin');
  }));

  // 未注册用户确认创建账户页：GET /sso/create（会话中需存在 ssoCreatePending）
  web.register('get', '/sso/create', wrap(async (req, res) => {
    const pending = req.session.ssoCreatePending;
    if (!pending || Date.now() > pending.exp) return void res.redirect('/login');
    if (!config.autoRegister) return void res.redirect('/login');
    const provider = config.providers.find((item) => item.id === pending.provider);
    if (!provider) return void res.redirect('/login');
    const base = safeUsername(pending.username);
    const username = await resolveUsername(async (name) => Promise.resolve(users.findByUsername(name)).then(Boolean), base, pending.sub);
    res.render('web/sso-create', {
      title: '创建账户',
      providerName: provider.name,
      providerIcon: provider.icon,
      subTail: String(pending.sub).slice(-4) || '****',
      username,
      email: pending.email ?? ''
    });
  }));

  // 确认创建（一次性）：POST /sso/confirm-create
  web.register('post', '/sso/confirm-create', wrap(async (req, res) => {
    const pending = req.session.ssoCreatePending;
    req.session.ssoCreatePending = undefined;
    if (!pending || Date.now() > pending.exp) {
      return void res.status(400).render('error', { title: '创建会话已失效', message: '创建账户的确认页已过期，请重新发起单点登录。' });
    }
    reloadConfig();
    if (!config.autoRegister) {
      return void res.status(400).render('error', { title: '自动注册已关闭', message: '站点已关闭自动注册，无法创建新账户。请联系管理员将你的平台账号绑定到已有账户。' });
    }
    // 回调与确认之间可能已被其他请求绑定
    let existing = await findBinding(database, pending.provider, pending.sub);
    let user = existing ? await Promise.resolve(users.findById(existing.user_id)) : undefined;
    if (!user) {
      const base = safeUsername(pending.username);
      const username = await resolveUsername(async (name) => Promise.resolve(users.findByUsername(name)).then(Boolean), base, pending.sub);
      const password = randomPassword();
      try {
        user = await users.register(username, pending.email || null, password);
      } catch (error) {
        // 邮箱可能已被占用：退回无邮箱注册；仍失败则按并发冲突处理或上抛。
        try { user = await users.register(username, null, password); }
        catch { throw error; }
      }
      try {
        await createBinding(database, { provider: pending.provider, sub: pending.sub, userId: user.id, username, email: pending.email || null });
      } catch (error) {
        const raced = await findBinding(database, pending.provider, pending.sub);
        if (raced) { const other = await Promise.resolve(users.findById(raced.user_id)); if (other) user = other; else throw error; }
        else throw error;
      }
    }
    if (!user) throw new Error('无法创建或定位站点账户');
    await new Promise((resolve) => req.session.regenerate(() => resolve()));
    req.session.userId = user.id;
    res.redirect('/admin');
  }));

  // ---------------------------------------------------------------- 授权接口

  web.register('get', '/sso/bindings', requireAuth, wrapJson(async (req, res) => {
    const userId = req.session.userId!;
    const bindings = await listBindingsByUser(database, userId);
    const meta = new Map(config.providers.filter(providerReady).map((provider) => [provider.id, provider]));
    res.json({
      ok: true,
      providers: [...meta.values()].map((provider) => ({ id: provider.id, name: provider.name, icon: provider.icon })),
      bindings: bindings.map((binding) => ({
        provider: binding.provider,
        providerName: meta.get(binding.provider)?.name ?? binding.provider,
        icon: meta.get(binding.provider)?.icon,
        username: binding.username,
        email: binding.email,
        subTail: String(binding.sub).slice(-4) || '****',
        createdAt: binding.created_at
      }))
    });
  }));

  // 发起绑定：POST /sso/connect/:provider （body.return_to 站内路径）
  web.register('post', `${CONNECT_PREFIX}:provider`, requireAuth, wrapJson(async (req, res) => {
    const provider = readyProvider(param(req.params.provider));
    if (!provider) return void res.status(400).json({ ok: false, message: '该认证平台不存在或未配置完成。' });
    const state = randomState();
    const pkce = provider.usePkce ? generatePkce() : undefined;
    req.session.ssoPending = {
      state,
      provider: provider.id,
      intent: 'bind',
      returnTo: safeReturnPath(req.body.return_to) ?? '/admin',
      verifier: pkce?.verifier,
      exp: Date.now() + STATE_TTL_MS
    };
    res.redirect(buildAuthorizeUrl(provider, redirectUriFor(req), state, pkce?.challenge));
  }));

  // 解绑：POST /sso/disconnect/:provider
  web.register('post', `${DISCONNECT_PREFIX}:provider`, requireAuth, wrapJson(async (req, res) => {
    const providerId = param(req.params.provider);
    const bindings = await listBindingsByUser(database, req.session.userId!);
    if (!bindings.some((binding) => binding.provider === providerId)) {
      return void res.status(400).json({ ok: false, message: '该平台账号未绑定在当前账户下。' });
    }
    await removeBindingByUserAndProvider(database, req.session.userId!, providerId);
    res.json({ ok: true, redirect: safeReturnPath(req.body.return_to) ?? '/admin' });
  }));

  // ---------------------------------------------------------------- 设置页

  const manage = [requireAuth, checkPermission(MANAGE_PERMISSION)];
  const redirectWithNotice = (res: Response, message: string) => res.redirect(`${SETTINGS_URL}?notice=${encodeURIComponent(message)}`);

  web.register('get', SETTINGS_URL, ...manage, wrap(async (req, res) => {
    res.render('admin/oidc-sso-settings', {
      title: 'OIDC 单点登录',
      config,
      providersJson: config.providers.length ? JSON.stringify(config.providers, null, 2) : exampleProvidersJson(),
      callbackOrigin: originOf(req),
      notice: text(req.query.notice)
    });
  }));

  web.register('post', `${SETTINGS_URL}/save`, ...manage, wrap(async (req, res) => {
    try {
      const next = parseSettingsForm(req.body as Record<string, unknown>);
      const errors = validateConfig(next);
      if (errors.length) return void redirectWithNotice(res, `保存失败：${errors.join('；')}`);
      const changed = next.callbackPath !== config.callbackPath;
      saveConfig(plugins, next);
      reloadConfig();
      redirectWithNotice(res, `设置已保存。${changed ? '回调路径已变更，请重启站点后生效。' : ''}`);
    } catch (error) {
      redirectWithNotice(res, `保存失败：${messageOf(error)}`);
    }
  }));

  web.register('post', `${SETTINGS_URL}/discovery`, ...manage, wrapJson(async (req, res) => {
    const discoveryUrl = text(req.body.discovery_url);
    if (!/^https?:\/\//i.test(discoveryUrl)) return void res.status(400).json({ ok: false, message: '请输入 Discovery 文档地址（https://.../.well-known/openid-configuration）' });
    const provider = await discoverOpenIdProvider(discoveryUrl, {
      name: text(req.body.name),
      clientId: text(req.body.client_id),
      clientSecret: text(req.body.client_secret),
      icon: text(req.body.icon)
    });
    res.json({ ok: true, provider });
  }));

  web.viewDir('views');
  context.logger.info('activated');

  // ---------------------------------------------------------------- 内部实现

  /** 绑定意图回调：仅对当前登录用户写入绑定关系。 */
  async function handleBindCallback(req: Request, res: Response, provider: SsoProvider, identity: SsoIdentity, returnTo: string): Promise<void> {
    if (!req.session.userId) {
      return void res.status(401).render('error', { title: '请先登录', message: '绑定需要在登录状态下进行，请先登录后再绑定此平台账号。' });
    }
    const existing = await findBinding(database, provider.id, identity.sub);
    if (existing) {
      if (existing.user_id !== req.session.userId) {
        return void res.status(409).render('error', { title: '绑定失败', message: `该平台账号已绑定到其他账户（${provider.name}），无法重复绑定。` });
      }
      await refreshBindingSnapshot(database, provider.id, identity.sub, identity.username || existing.username, identity.email ?? existing.email);
    } else {
      await createBinding(database, { provider: provider.id, sub: identity.sub, userId: req.session.userId, username: identity.username || null, email: identity.email });
    }
    res.redirect(returnTo);
  }

  /** 登录意图回调：已绑定 → 直接登录；未绑定 → 询问是否创建（关闭自动注册则不再询问）。 */
  async function handleLoginCallback(req: Request, res: Response, provider: SsoProvider, identity: SsoIdentity, returnTo: string): Promise<void> {
    const binding = await findBinding(database, provider.id, identity.sub);
    let user = binding ? await Promise.resolve(users.findById(binding.user_id)) : undefined;
    if (user) {
      await refreshBindingSnapshot(database, provider.id, identity.sub, identity.username || binding!.username, identity.email ?? binding!.email);
    } else if (config.autoRegister) {
      // 未绑定且开放自动注册：询问用户是否创建（不静默注册）。
      req.session.ssoCreatePending = {
        provider: provider.id,
        sub: identity.sub,
        username: identity.username || 'user',
        email: identity.email,
        exp: Date.now() + STATE_TTL_MS
      };
      return void res.redirect('/sso/create');
    } else {
      return void res.status(403).render('error', {
        title: '账号未绑定',
        message: `该平台账号（${provider.name}）未绑定任何站点账户，且站点已关闭自动注册，无法登录。请联系管理员将你的平台账号绑定到已有账户，或改用账号密码登录。`
      });
    }
    if (!user) {
      return void res.status(400).render('error', { title: '登录失败', message: '绑定的站点账户不存在或已被删除。' });
    }
    // 标准登录态：regenerate 防会话固定；不标记 easy2faPassed，
    // 需要两步验证的用户由 easy-2fa 强制中间件自动转入挑战/绑定页。
    await new Promise((resolve) => req.session.regenerate(() => resolve()));
    req.session.userId = user.id;
    res.redirect(returnTo);
  }
}