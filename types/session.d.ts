/*
 * SSO Session Type Augmentation
 *
 * Adds the ssoPending and ssoCreatePending session fields used by the SSO
 * plugin.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Module augmentation for express-session: ssoPending carries the one-time
 * login/bind state (CSRF state, intent, PKCE verifier, return path) written
 * when a flow starts and cleared right after callback validation, while
 * ssoCreatePending holds the account-creation snapshot for the confirmation
 * page. Both expire after 10 minutes.
 * @since 1.0.0
 */

import 'express-session';
declare module 'express-session' {
  interface SessionData {
    /**
     * 单点登录进行中的一次性状态：发起登录/绑定时写入，回调校验后立即清除。
     * 承载 CSRF state、权限意图（登录或绑定）、PKCE verifier 与回跳地址。
     */
    ssoPending?: {
      state: string;
      provider: string;
      intent: 'login' | 'bind';
      returnTo?: string;
      verifier?: string;
      exp: number;
    };
    /**
     * 未注册用户在回调后确认创建的账户快照（一次性，10 分钟）。
     * 展示确认页 + 提交 /sso/confirm-create 时读取，完成后清除。
     */
    ssoCreatePending?: {
      provider: string;
      sub: string;
      username: string;
      email: string | null;
      exp: number;
    };
  }
}