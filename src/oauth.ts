/*
 * OAuth2 / OIDC Protocol Layer
 *
 * Protocol helpers for the SSO flow: authorize URLs, code exchange,
 * userinfo, and identity extraction.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * OAuth2 / OIDC protocol layer: authorize-URL construction, authorization-
 * code exchange for tokens, UserInfo fetching, OIDC Discovery auto-fill,
 * identity field extraction, and username sanitization. Built entirely on
 * Node's built-in fetch (Node 24), with no external dependencies.
 * @since 1.0.0
 */

import { createHash, randomBytes } from 'node:crypto';
import type { SsoProvider } from './config.js';

export interface SsoIdentity {
  /** 平台账号唯一标识（openid / sub）。 */
  sub: string;
  /** 平台侧用户名（尽力提取，缺省时用邮箱前缀）。 */
  username: string;
  /** 平台侧邮箱（可能为空）。 */
  email: string | null;
}

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

export function randomState(): string { return base64url(randomBytes(24)); }

/** PKCE S256：返回明文 verifier 与其 challenge。 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizeUrl(provider: SsoProvider, redirectUri: string, state: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    scope: provider.scope,
    state
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  const separator = provider.authorizeUrl.includes('?') ? '&' : '?';
  return `${provider.authorizeUrl}${separator}${params.toString()}`;
}

/** 授权码换令牌：标准 OAuth2 Token Endpoint（form-encoded），响应 JSON 或表单均支持。 */
export async function exchangeCode(provider: SsoProvider, code: string, redirectUri: string, codeVerifier?: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body
  });
  const text = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text) as Record<string, unknown>; }
  catch { data = Object.fromEntries(new URLSearchParams(text)) as Record<string, unknown>; }
  if (!response.ok) throw new Error(`令牌交换失败（${response.status}）：${text.slice(0, 200)}`);
  if (!data.access_token) throw new Error('令牌响应缺少 access_token');
  return data;
}

/** 获取用户信息：Bearer 令牌 GET userinfo（OIDC 标准端点）。 */
export async function fetchUserInfo(provider: SsoProvider, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(provider.userInfoUrl, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`用户信息获取失败（${response.status}）`);
  return await response.json() as Record<string, unknown>;
}

/** 从 userinfo 响应提取本站身份（sub / 用户名 / 邮箱），字段名按 provider 配置。 */
export function extractIdentity(provider: SsoProvider, info: Record<string, unknown>): SsoIdentity {
  const rawSub = info[provider.idField] ?? info.sub ?? info.id ?? info.openid ?? info.user_id;
  const sub = String(rawSub ?? '').trim();
  if (!sub) throw new Error('平台未返回账号唯一标识（sub），请检查 idField 配置');
  const rawUsername = firstDefined(info, provider.usernameField, 'preferred_username', 'nickname', 'name', 'username', 'login');
  let username = String(rawUsername ?? '').trim();
  const rawEmail = info[provider.emailField] ?? info.email;
  const email = String(rawEmail ?? '').trim() || null;
  if (!username && email) username = email.split('@')[0];
  return { sub, username, email };
}

function firstDefined(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return undefined;
}

/** 用户名安全化：仅保留字母/数字/下划线/连字符，空格折叠为下划线。 */
export function safeUsername(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, '_').replace(/[^\p{Letter}\p{Number}_-]/gu, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'user';
}

/** 重名用户名追加 openid 后四位：base_openidXXXX；仍重名时追加 -2/-3。 */
export function resolveUsername(existing: (username: string) => Promise<boolean> | boolean, base: string, sub: string): Promise<string> {
  return (async () => {
    const tail = (sub.slice(-4).replace(/[^\p{Letter}\p{Number}]/gu, '') || 'xxxx');
    const candidateBase = base.length < 3 ? base.padEnd(3, '_') : base;
    let candidate = candidateBase;
    let index = 1;
    while (await existing(candidate)) {
      candidate = index === 1 ? `${candidateBase}_openid${tail}` : `${candidateBase}_openid${tail}-${index}`;
      index += 1;
    }
    return candidate;
  })();
}

/** OIDC Discovery：从 /.well-known/openid-configuration 提取关键端点并生成平台配置骨架。 */
export async function discoverOpenIdProvider(discoveryUrl: string, extra: { name?: string; clientId?: string; clientSecret?: string; icon?: string }): Promise<Partial<SsoProvider>> {
  let response: Response;
  try { response = await fetch(discoveryUrl, { headers: { accept: 'application/json' } }); }
  catch { throw new Error('无法访问 Discovery 地址'); }
  if (!response.ok) throw new Error(`Discovery 请求失败（${response.status}）`);
  const document = await response.json() as Record<string, unknown>;
  const authorizeUrl = String(document.authorization_endpoint ?? '').trim();
  const tokenUrl = String(document.token_endpoint ?? '').trim();
  const userInfoUrl = String(document.userinfo_endpoint ?? '').trim();
  if (!authorizeUrl || !tokenUrl || !userInfoUrl) throw new Error('Discovery 文档缺少 authorization/token/userinfo 端点');
  const issuer = String(document.issuer ?? '').trim();
  const name = extra.name?.trim() || (issuer || discoveryUrl).replace(/^https?:\/\//i, '').split('/')[0] || 'OIDC 平台';
  return {
    id: 'oidc',
    name,
    enabled: true,
    type: 'oidc',
    icon: extra.icon?.trim() || '🔐',
    clientId: extra.clientId?.trim() ?? '',
    clientSecret: extra.clientSecret?.trim() ?? '',
    scope: 'openid profile email',
    authorizeUrl,
    tokenUrl,
    userInfoUrl,
    idField: 'sub',
    usernameField: 'preferred_username',
    emailField: 'email'
  };
}