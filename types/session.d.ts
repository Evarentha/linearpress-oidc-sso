/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
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