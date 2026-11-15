/*
 * OIDC SSO Plugin Entry Point
 *
 * Sign in with any OAuth2 / OpenID Connect provider, and connect provider accounts to site accounts.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>A successful provider sign-in hands the user to the core login flow
 * (<code>auth.beginLogin</code>), so account checks and two-factor sign-in
 * apply exactly as for passwords; 3.x wrote the session itself and relied on
 * other plugins to notice.</p>
 * <p>Provider accounts are never matched to site accounts by email (that
 * would let a provider take over accounts); unknown accounts are only
 * created after the user confirms, when registration is open.</p>
 *
 * @since 1.0.0
 */

import { randomBytes } from 'node:crypto';
import type { Context } from 'cordis';
import type { Request, Response } from 'express';
import { checkPermission, requireAuth, route, text, messageOf, safeNext, utcNow, esc } from 'linearpress/plugin-api';
import { normalizeCallbackPath, normalizeConfig, parseProviderForm, providerErrors, providerReady, type SsoConfig, type SsoProvider } from './src/config.js';
import { buildAuthorizeUrl, discoverOpenIdProvider, exchangeCode, extractIdentity, fetchUserInfo, generatePkce, randomState, resolveUsername, safeUsername, type SsoIdentity } from './src/oauth.js';
import { bindingsOf, countByProvider, createBinding, ensureSchema, findBinding, refreshBinding, removeBinding } from './src/store.js';

const PLUGIN_ID = 'oidc-sso';
const ADMIN = '/admin/sso';
const ACCOUNT = '/account/connections';
const AUTH_LAYOUT = 'layouts/auth';
const TTL = 10 * 60_000;

declare module 'express-session' {
  interface SessionData {
    ssoPending?: { state: string; provider: string; intent: 'login' | 'bind'; next: string; verifier?: string; exp: number };
    ssoCreate?: { provider: string; sub: string; username: string; email: string | null; next: string; exp: number };
  }
}

export default async function oidcSso(ctx: Context): Promise<void> {
  const { web, ui, admin, auth } = ctx.linearpress;
  const db = () => ctx.databaseService;
  await ensureSchema(db());
  let config: SsoConfig = normalizeConfig(await ctx.plugins.getConfig(PLUGIN_ID));
  const save = async () => { await ctx.plugins.setConfig(PLUGIN_ID, config); };
  const ready = () => config.providers.filter(providerReady);
  const provider = (id: string) => ready().find((item) => item.id === id);
  const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;
  const registrationOpen = (res: Response) => res.locals.filter?.('auth.registrationOpen', true) !== false;
  const notice = (res: Response, status: number, heading: string, message: string, actions = [{ href: '/login', label: '返回登录', primary: true }]) =>
    res.status(status).render('auth/notice', { layout: AUTH_LAYOUT, pageTitle: heading, heading, message, actions });
  const icon = (item: SsoProvider) => item.icon && [...item.icon].length <= 2 ? `<span aria-hidden="true">${esc(item.icon)}</span>` : '';

  /* ---------- buttons on the sign-in and registration pages ---------- */
  ui.slot('auth.login.after', {
    match: () => ready().length > 0,
    render: ({ req }) => `<div class="stack sso-buttons" data-lp-plugin="${PLUGIN_ID}">${ready().map((item) => `<a class="btn btn-block" href="/sso/login/${encodeURIComponent(item.id)}${req.query.next ? `?next=${encodeURIComponent(String(req.query.next))}` : ''}">${icon(item)}使用 ${esc(item.name)} 登录</a>`).join('')}</div>`
  });
  ui.slot('auth.register.after', {
    match: () => ready().length > 0 && config.autoRegister,
    render: () => `<div class="stack sso-buttons" data-lp-plugin="${PLUGIN_ID}"><div class="auth-divider">或者</div>${ready().map((item) => `<a class="btn btn-block" href="/sso/login/${encodeURIComponent(item.id)}">${icon(item)}使用 ${esc(item.name)} 注册</a>`).join('')}</div>`
  });

  /* ---------- start ---------- */
  const start = (req: Request, res: Response, item: SsoProvider, intent: 'login' | 'bind', next: string) => {
    const state = randomState();
    const pkce = item.usePkce ? generatePkce() : undefined;
    req.session.ssoPending = { state, provider: item.id, intent, next, verifier: pkce?.verifier, exp: Date.now() + TTL };
    res.redirect(buildAuthorizeUrl(item, `${origin(req)}${config.callbackPath}`, state, pkce?.challenge));
  };
  web.register('get', '/sso/login/:provider', (req, res) => {
    const item = provider(String(req.params.provider));
    if (!item) return void notice(res, 404, '无法使用这个登录方式', '这个登录方式不存在或还没有配置完成。');
    if (req.session.userId) return void res.redirect(safeNext(req.query.next, '/'));
    start(req, res, item, 'login', safeNext(req.query.next));
  });
  web.register('post', '/sso/connect/:provider', requireAuth, (req, res) => {
    const item = provider(String(req.params.provider));
    if (!item) { req.flash('danger', '这个登录方式不存在或还没有配置完成。'); return void res.redirect(303, ACCOUNT); }
    start(req, res, item, 'bind', ACCOUNT);
  });

  /* ---------- callback (path is read per request, so changing it needs no restart) ---------- */
  web.middleware((req, res, next) => {
    if (req.method !== 'GET' || req.path !== config.callbackPath) return next();
    void callback(req, res).catch((error) => {
      ctx.logger.warn('sso callback failed:', messageOf(error));
      if (!res.headersSent) notice(res, 502, '登录没有完成', `认证平台返回了错误：${messageOf(error)}。请稍后重试，或改用账号密码登录。`);
    });
  });
  async function callback(req: Request, res: Response) {
    const pending = req.session.ssoPending;
    req.session.ssoPending = undefined;
    if (text(req.query.error)) return void notice(res, 400, '已取消', '你在认证平台取消了授权。', [{ href: pending?.intent === 'bind' ? ACCOUNT : '/login', label: '返回', primary: true }]);
    if (!pending || pending.state !== text(req.query.state) || Date.now() > pending.exp) return void notice(res, 400, '登录已过期', '这次登录已经过期或不是从本站发起的，请重新开始。');
    const item = provider(pending.provider);
    if (!item) return void notice(res, 400, '登录方式已停用', '这个登录方式刚刚被停用了。');
    const token = await exchangeCode(item, text(req.query.code), `${origin(req)}${config.callbackPath}`, pending.verifier);
    const identity = extractIdentity(item, await fetchUserInfo(item, String(token.access_token ?? '')));
    if (pending.intent === 'bind') return void bind(req, res, item, identity);
    const binding = await findBinding(db(), item.id, identity.sub);
    const user = binding ? await ctx.users.findById(Number(binding.user_id)) : undefined;
    if (user) {
      await refreshBinding(db(), item.id, identity.sub, identity.username || binding!.username, identity.email ?? binding!.email);
      return void signIn(req, res, user, pending.next, item);
    }
    if (config.autoRegister && registrationOpen(res)) {
      req.session.ssoCreate = { provider: item.id, sub: identity.sub, username: identity.username || 'user', email: identity.email, next: pending.next, exp: Date.now() + TTL };
      return void res.redirect('/sso/create');
    }
    notice(res, 403, '这个账号还没有关联', `你的 ${item.name} 账号还没有关联到本站账号。请先用账号密码登录，然后在“关联账号”页面关联。`);
  }
  async function signIn(req: Request, res: Response, user: import('linearpress/plugin-api').User, next: string, item: SsoProvider) {
    const denied = await auth.beginLogin(req, res, user, { next, method: `sso:${item.id}` });
    if (denied) notice(res, denied.status ?? 403, '无法登录', denied.deny);
  }
  async function bind(req: Request, res: Response, item: SsoProvider, identity: SsoIdentity) {
    if (!req.session.userId) return void notice(res, 401, '请先登录', '关联账号需要先登录本站。');
    const existing = await findBinding(db(), item.id, identity.sub);
    if (existing && Number(existing.user_id) !== req.session.userId) req.flash('danger', `这个 ${item.name} 账号已经关联了本站的另一个账号。`);
    else if (existing) { await refreshBinding(db(), item.id, identity.sub, identity.username || existing.username, identity.email ?? existing.email); req.flash('success', `${item.name} 账号已经是关联状态。`); }
    else if ((await bindingsOf(db(), req.session.userId)).some((row) => row.provider === item.id)) req.flash('warning', `你已经关联了另一个 ${item.name} 账号，请先解除。`);
    else { await createBinding(db(), { provider: item.id, sub: identity.sub, userId: req.session.userId, username: identity.username || null, email: identity.email, now: utcNow() }); req.flash('success', `已关联 ${item.name} 账号${identity.username ? ` ${identity.username}` : ''}。`); }
    res.redirect(303, ACCOUNT);
  }

  /* ---------- create an account after confirmation ---------- */
  const taken = async (name: string) => Boolean(await ctx.users.findByUsername(name));
  web.register('get', '/sso/create', route(async (req, res) => {
    const pending = req.session.ssoCreate;
    const item = pending && Date.now() < pending.exp ? provider(pending.provider) : undefined;
    if (!pending || !item || !config.autoRegister || !registrationOpen(res)) return void res.redirect('/login');
    res.render(`${PLUGIN_ID}/create`, { layout: AUTH_LAYOUT, pageTitle: '创建账号', providerName: item.name, username: await resolveUsername(taken, safeUsername(pending.username), pending.sub), email: pending.email });
  }));
  web.register('post', '/sso/create', route(async (req, res) => {
    const pending = req.session.ssoCreate;
    req.session.ssoCreate = undefined;
    const item = pending && Date.now() < pending.exp ? provider(pending.provider) : undefined;
    if (!pending || !item || !config.autoRegister || !registrationOpen(res)) return void notice(res, 400, '页面已过期', '请重新用第三方账号登录。');
    const raced = await findBinding(db(), item.id, pending.sub);
    let user = raced ? await ctx.users.findById(Number(raced.user_id)) : undefined;
    if (!user) {
      const username = await resolveUsername(taken, safeUsername(pending.username), pending.sub);
      const password = randomBytes(24).toString('base64url');
      const emailFree = pending.email && !await ctx.users.findByEmail(pending.email);
      user = await ctx.users.register(username, emailFree ? pending.email : null, password);
      await createBinding(db(), { provider: item.id, sub: pending.sub, userId: user.id, username: pending.username, email: pending.email, createdAccount: true, now: utcNow() });
      req.flash('success', `欢迎，${user.username}！账号已创建并关联 ${item.name}。`);
    }
    await signIn(req, res, user, pending.next, item);
  }));

  /* ---------- the user's connections ---------- */
  // Reached from the account page card below (the user menu links to /account).
  ui.slot('account.sections', {
    order: 30,
    match: (req) => req.path === '/account' && ready().length > 0,
    prepare: async (req) => (req.session.userId ? { linked: (await bindingsOf(db(), req.session.userId)).map((row) => provider(row.provider)?.name).filter(Boolean) } : null),
    render: ({ data, esc }) => {
      const state = data as { linked: string[] } | null;
      if (!state) return '';
      const summary = state.linked.length ? `已关联：${state.linked.map((name) => esc(name)).join('、')}` : '还没有关联其他登录方式。';
      return `<section class="card stack" data-lp-plugin="oidc-sso" aria-labelledby="sso-account-card"><div><h2 class="section-title" id="sso-account-card">关联账号</h2><p>${summary}</p></div><div><a class="btn" href="${ACCOUNT}">管理关联账号</a></div></section>`;
    }
  });
  web.register('get', ACCOUNT, requireAuth, route(async (req, res) => {
    const rows = await bindingsOf(db(), req.session.userId!);
    res.render(`${PLUGIN_ID}/account`, { pageTitle: '关联账号', providers: ready().map((item) => ({ item, binding: rows.find((row) => row.provider === item.id) })), orphan: rows.filter((row) => !provider(row.provider)) });
  }));
  web.register('post', `${ACCOUNT}/:provider/delete`, requireAuth, route(async (req, res) => {
    const rows = await bindingsOf(db(), req.session.userId!);
    const row = rows.find((item) => item.provider === String(req.params.provider));
    if (!row) req.flash('warning', '没有找到这个关联。');
    else if (row.created_account && rows.length === 1) req.flash('danger', '这是你登录本站的唯一方式（账号是通过它创建的，没有设置过密码）。请先请管理员为你设置密码，或关联另一个登录方式。');
    else { await removeBinding(db(), req.session.userId!, row.provider); req.flash('success', '已解除关联。'); }
    res.redirect(303, ACCOUNT);
  }));
  web.register('get', '/sso/bindings', (_req, res) => res.redirect(301, ACCOUNT));

  /* ---------- admin ---------- */
  admin.registerMenu({ title: '单点登录', link: ADMIN, group: 'users', order: 40, permission: 'plugin:manage' });
  admin.registerSettings({ label: '单点登录', link: ADMIN, description: '用第三方账号（OIDC / OAuth2）登录' });
  web.register('get', '/admin/oidc-sso/settings', (_req, res) => res.redirect(301, ADMIN));
  const manage = [requireAuth, checkPermission('plugin:manage')];
  web.register('get', ADMIN, ...manage, route(async (req, res) => {
    res.render(`${PLUGIN_ID}/admin`, { pageTitle: '单点登录', config, counts: await countByProvider(db()), callbackUrl: `${origin(req)}${config.callbackPath}`, ready: providerReady });
  }));
  web.register('post', `${ADMIN}/settings`, ...manage, route(async (req, res) => {
    const path = normalizeCallbackPath(req.body.callbackPath);
    if (!/^\/[\w\-/]{1,80}$/.test(path) || ['/login', '/admin', '/register', '/sso'].some((p) => path === p || path.startsWith(`${p}/`))) { req.flash('danger', '回调路径只能包含字母、数字、短横线和斜杠，并且不能和系统地址重复。'); return void res.redirect(303, ADMIN); }
    config = { ...config, autoRegister: req.body.autoRegister === 'on', callbackPath: path };
    await save();
    req.flash('success', '已保存，立即生效。如果改了回调路径，记得同步修改认证平台里的回调地址。');
    res.redirect(303, ADMIN);
  }));
  const renderProvider = (res: Response, item: Partial<SsoProvider> & { isNew: boolean }, errors: Record<string, string> = {}, status = 200) =>
    res.status(status).render(`${PLUGIN_ID}/provider`, { pageTitle: item.isNew ? '添加登录方式' : `编辑 ${item.name}`, crumbs: [{ title: '单点登录', href: ADMIN }], item, errors, hasSecret: Boolean(item.clientSecret), callbackUrl: `${origin(res.req)}${config.callbackPath}` });
  web.register('get', `${ADMIN}/providers/:id`, ...manage, (req, res) => {
    const item = config.providers.find((p) => p.id === String(req.params.id));
    if (!item) return void res.redirect(303, ADMIN);
    renderProvider(res, { ...item, isNew: false });
  });
  // Registered after /providers/:id on purpose: later routes match first, so the literal path must come last.
  web.register('get', `${ADMIN}/providers/new`, ...manage, (_req, res) => renderProvider(res, { isNew: true, enabled: true, type: 'oidc', scope: 'openid profile email', idField: 'sub', usernameField: 'preferred_username', emailField: 'email', usePkce: true }));
  web.register('post', `${ADMIN}/providers`, ...manage, route(async (req, res) => {
    const existing = config.providers.find((p) => p.id === text(req.body.originalId));
    const item = parseProviderForm(req.body ?? {}, existing);
    const errors = providerErrors(item);
    if (!existing && config.providers.some((p) => p.id === item.id)) errors.id = '这个标识已经被使用';
    if (Object.keys(errors).length) return void renderProvider(res, { ...item, clientSecret: existing?.clientSecret ?? '', isNew: !existing }, errors, 400);
    config = { ...config, providers: existing ? config.providers.map((p) => (p.id === existing.id ? item : p)) : [...config.providers, item] };
    await save();
    req.flash('success', `已保存「${item.name}」${item.enabled ? '，登录页上会出现它的按钮' : '（已停用）'}。`);
    res.redirect(303, ADMIN);
  }));
  web.register('post', `${ADMIN}/providers/:id/delete`, ...manage, route(async (req, res) => {
    const item = config.providers.find((p) => p.id === String(req.params.id));
    config = { ...config, providers: config.providers.filter((p) => p.id !== String(req.params.id)) };
    await save();
    req.flash('success', item ? `已删除「${item.name}」。已有的关联会保留，用同样的标识重新添加后即可恢复。` : '已删除。');
    res.redirect(303, ADMIN);
  }));
  web.register('post', `${ADMIN}/discovery`, ...manage, route(async (req, res) => {
    const url = text(req.body.url);
    if (!/^https?:\/\//i.test(url)) return void res.status(400).json({ ok: false, message: '请输入 Discovery 地址，例如 https://idp.example.com/.well-known/openid-configuration' });
    try { res.json({ ok: true, provider: await discoverOpenIdProvider(url, { name: text(req.body.name) }) }); }
    catch (error) { res.status(400).json({ ok: false, message: messageOf(error) }); }
  }));

  ctx.logger.info(`activated (${ready().length} providers ready)`);
}
