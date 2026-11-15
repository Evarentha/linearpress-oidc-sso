/*
 * Single Sign-On Configuration Model
 *
 * Types, defaults, validation, and settings-form parsing for the SSO plugin, stored as JSON in the plugin registry.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Configuration model for the OIDC / OAuth2 single sign-on plugin.
 *
 * <p>The whole configuration is stored as JSON in the plugin registry
 * (ctx.plugins.getConfig/setConfig) with defaults plus a shallow merge
 * (consistent with easy-captcha / advanced-user-management). Providers come
 * from the user-configured providers array: any OAuth2 / OIDC
 * (Authorization Code + userinfo) is supported, with customizable field
 * mappings.</p>
 * @since 1.0.0
 */

/** 认证平台类型（仅用于设置页展示，不改变流程）。 */
export type SsoProviderType = 'oidc' | 'oauth2' | 'other';

export interface SsoProvider {
  /** 平台唯一 id（登录/回调路由使用），由名称自动 slug 生成。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 是否启用（停用的平台不展示、不参与登录）。 */
  enabled: boolean;
  /** 平台类型，仅展示用。 */
  type: SsoProviderType;
  /** 登录按钮前的图标（Emoji 等）。 */
  icon?: string;
  clientId: string;
  clientSecret: string;
  /** 授权 scope（空格分隔）。 */
  scope: string;
  /** Authorization Endpoint。 */
  authorizeUrl: string;
  /** Token Endpoint。 */
  tokenUrl: string;
  /** UserInfo Endpoint（返回 JSON）。 */
  userInfoUrl: string;
  /** 平台账号唯一标识字段名称（OIDC 默认 "sub"）。 */
  idField: string;
  /** 用户名来源字段（默认依次尝试 preferred_username/nickname/name）。 */
  usernameField: string;
  /** 邮箱来源字段（默认 "email"）。 */
  emailField: string;
  /** 可选：启用 PKCE（S256），适合不支持客户端密钥校验的公开/移动端场景。 */
  usePkce?: boolean;
}

export interface SsoConfig {
  /** 回调路径，默认 /sso-callback；需与认证平台后台填写的回调地址一致。 */
  callbackPath: string;
  /** 未注册用户是否允许自动注册（关闭后不再询问创建，仅允许已绑定用户登录）。 */
  autoRegister: boolean;
  /** 认证平台列表。 */
  providers: SsoProvider[];
}

export const DEFAULT_CALLBACK_PATH = '/sso-callback';

function asString(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
function asBoolean(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }

/** 与 Base post slug 同规则；分类/平台 id 用。 */
function slugify(value: string): string {
  return value.normalize('NFKD').replace(/\p{Mark}+/gu, '').toLocaleLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || 'sso';
}

/** 规范化回调路径：必须 "/" 开头；空值回退默认。 */
export function normalizeCallbackPath(value: unknown): string {
  let raw = asString(value, DEFAULT_CALLBACK_PATH).trim();
  if (!raw.startsWith('/')) raw = `/${raw}`;
  const clean = raw.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || DEFAULT_CALLBACK_PATH;
  return clean.startsWith('/') ? clean : `/${clean}`;
}

export function normalizeProvider(raw: unknown, index: number, usedIds: Set<string>): SsoProvider {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = asString(input.name, `平台 ${index + 1}`).trim() || `平台 ${index + 1}`;
  let id = asString(input.id, slugify(name));
  if (!id || id === 'sso') id = slugify(name);
  let suffix = 2; const baseId = id;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  usedIds.add(id);
  return {
    id,
    name,
    enabled: asBoolean(input.enabled, true),
    type: input.type === 'oauth2' || input.type === 'other' ? input.type : 'oidc',
    icon: asString(input.icon, '').trim() || undefined,
    clientId: asString(input.clientId, '').trim(),
    clientSecret: asString(input.clientSecret, '').trim(),
    scope: asString(input.scope, 'openid profile email').trim() || 'openid profile email',
    authorizeUrl: asString(input.authorizeUrl, '').trim(),
    tokenUrl: asString(input.tokenUrl, '').trim(),
    userInfoUrl: asString(input.userInfoUrl, '').trim(),
    idField: asString(input.idField, 'sub').trim() || 'sub',
    usernameField: asString(input.usernameField, 'preferred_username').trim() || 'preferred_username',
    emailField: asString(input.emailField, 'email').trim() || 'email',
    usePkce: asBoolean(input.usePkce, false)
  };
}

/** 合并用户配置到默认值；provider 缺 id 自动生成并去重。 */
export function normalizeConfig(raw: unknown): SsoConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const usedIds = new Set<string>();
  const providers = Array.isArray(input.providers)
    ? input.providers.map((item, index) => normalizeProvider(item, index, usedIds))
    : [];
  return {
    callbackPath: normalizeCallbackPath(input.callbackPath),
    autoRegister: asBoolean(input.autoRegister, false),
    providers
  };
}

/** 返回配置问题列表（空数组 = 可保存）。 */
export function validateConfig(config: SsoConfig): string[] {
  const errors: string[] = [];
  if (!config.callbackPath.startsWith('/')) errors.push('回调路径必须以 / 开头');
  if (!config.providers.length) errors.push('至少需要配置一个认证平台');
  for (const provider of config.providers) {
    if (!provider.enabled) continue;
    if (!provider.clientId) errors.push(`平台「${provider.name}」缺少 Client ID`);
    if (!provider.clientSecret) errors.push(`平台「${provider.name}」缺少 Client Secret`);
    if (!provider.authorizeUrl) errors.push(`平台「${provider.name}」缺少授权地址 authorizeUrl`);
    if (!provider.tokenUrl) errors.push(`平台「${provider.name}」缺少令牌地址 tokenUrl`);
    if (!provider.userInfoUrl) errors.push(`平台「${provider.name}」缺少用户信息地址 userInfoUrl`);
    for (const url of [provider.authorizeUrl, provider.tokenUrl, provider.userInfoUrl]) {
      if (url && !/^https?:\/\//i.test(url)) errors.push(`平台「${provider.name}」的地址必须为 http(s) URL`);
    }
  }
  return errors;
}

/** One provider from the settings form. A blank secret keeps the saved one. */
export function parseProviderForm(body: Record<string, unknown>, existing?: SsoProvider): SsoProvider {
  const text = (key: string) => String(body[key] ?? '').trim();
  const provider = normalizeProvider({
    id: existing?.id ?? (text('id') || undefined),
    name: text('name'), enabled: body.enabled === 'on', type: text('type'), icon: text('icon'),
    clientId: text('clientId'), clientSecret: text('clientSecret') || existing?.clientSecret || '',
    scope: text('scope'), authorizeUrl: text('authorizeUrl'), tokenUrl: text('tokenUrl'), userInfoUrl: text('userInfoUrl'),
    idField: text('idField'), usernameField: text('usernameField'), emailField: text('emailField'), usePkce: body.usePkce === 'on'
  }, 0, new Set());
  if (body.clearSecret === 'on') provider.clientSecret = '';
  return provider;
}

/** Problems that keep a provider from working, as field → message. */
export function providerErrors(provider: SsoProvider): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!provider.name) errors.name = '请填写名称';
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(provider.id)) errors.id = '标识只能包含小写字母、数字和短横线';
  if (provider.enabled) {
    if (!provider.clientId) errors.clientId = '请填写 Client ID';
    if (!provider.clientSecret) errors.clientSecret = '请填写 Client Secret';
    for (const key of ['authorizeUrl', 'tokenUrl', 'userInfoUrl'] as const) {
      if (!provider[key]) errors[key] = '请填写地址';
      else if (!/^https:\/\//i.test(provider[key]) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(provider[key])) errors[key] = '必须是 https 地址（本机测试可用 http://localhost）';
    }
  }
  return errors;
}
/** 认证平台是否可用于登录（enabled 且关键配置齐全）。 */
export function providerReady(provider: SsoProvider): boolean {
  return provider.enabled && Boolean(provider.clientId && provider.clientSecret && provider.authorizeUrl && provider.tokenUrl && provider.userInfoUrl);
}

/** 供设置页展示的默认模板 JSON。 */
export function exampleProvidersJson(): string {
  return JSON.stringify([
    {
      id: 'my-oidc',
      name: '我的认证平台',
      enabled: true,
      type: 'oidc',
      icon: '🔐',
      clientId: '',
      clientSecret: '',
      scope: 'openid profile email',
      authorizeUrl: 'https://idp.example.com/oauth2/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/token',
      userInfoUrl: 'https://idp.example.com/oauth2/userinfo',
      idField: 'sub',
      usernameField: 'preferred_username',
      emailField: 'email',
      usePkce: false
    }
  ], null, 2);
}