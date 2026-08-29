<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# OIDC 单点登录 · OIDC SSO

**OIDC / OAuth2 (Authorization Code)** single sign-on for LinearPress：add any compliant provider（university/enterprise IdP、GitHub、GitLab、Keycloak、Authing、Okta、Azure AD…）；provider buttons appear at the top of the login page.

为 LinearPress 提供基于 **OIDC / OAuth2（Authorization Code）** 的单点登录：可自定义添加任意兼容的认证平台（学校/企业统一身份、GitHub、GitLab、Keycloak、Authing、Okta、Azure AD 等），登录页顶部自动出现平台登录按钮。

> Independent plugin repository for LinearPress **oidc-sso**. Dependencies：none（Node 24 built-in `fetch`/`crypto`）.
> 本仓库是 LinearPress 插件 **oidc-sso** 的独立仓库。

## Why Plugins? / 插件化的优势

- **Auth externalized, core untouched** —— SSO uses its own callback route（GET），never passing through `/login`；no interaction with easy-captcha（SSO login skips captcha）.
  **认证外置不改核心**——SSO 走独立回调路由，与人机验证全程不冲突。
- **Two binding entry points** —— profile edit page（colorful-profiles installed）or dashboard — via hooks，neither side changes code.
  **两处绑定入口**——靠 Hook 挂载，双方零改码。
- **Controlled auto-registration** —— by default asks before creating an account（can be limited to existing users only）.
  **自动注册可控**。

## Features / 功能

1. **Custom providers / 自定义平台**：client_id/secret、authorize/token/userinfo URLs & field mapping；**OIDC Discovery** one-click autofill（paste the `.well-known/openid-configuration` URL）.
2. **Configurable callback** / 回调地址可配置：default `/sso-callback`（change requires restart）.
3. **Login buttons / 登录按钮**：injected at the top of the login page；hidden when no provider configured.
4. **Auto-register / auto-bind / 自动注册与绑定**：conflict usernames get `_openid` + suffix；sanitized usernames（alphanumeric/_/-；short names padded；`-2/-3` on further collisions）.
5. **Bind / unbind / 绑定与解绑**：profile edit or dashboard.

## Install / 安装

```bash
# Option 1 — workspace sync（工作区同步）
cd base && sh scripts/sync-plugins.sh oidc-sso

# Option 2 — clone into runtime dir（目录名必须等于插件 id）
git clone https://github.com/Averithen/linearpress-oidc-sso src/plugins/oidc-sso
```

## Configure a Provider / 配置一个平台（example / 示例）

1. Create an app in the IdP with callback `https://你的站点/<回调路径>`（default `/sso-callback`）.
2. Admin → 「单点登录」：fill Discovery URL + Client ID/Secret → "Generate & append from Discovery"；or paste an OIDC/OAuth2 template and edit.
3. Save；the login page shows「通过 平台名 登录」.

providers JSON fields：`id / name / icon / enabled / type(oidc|oauth2) / clientId / clientSecret / scope / authorizeUrl / tokenUrl / userInfoUrl / idField(sub) / usernameField / emailField / usePkce`.

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Averithen/linearpress-oidc-sso LinearPress/Plugins/oidc-sso
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh oidc-sso
npm run dev
```

## Directory / 目录结构

```text
oidc-sso/
├── plugin.json            Manifest
├── index.ts               entry：callback, bind/unbind, login button injection
├── src/
│   ├── config.ts          providers config model
│   ├── oauth.ts           OIDC/OAuth2 flow + Discovery
│   └── store.ts           bindings storage
├── views/                 login-page injection & admin settings
├── public/                front-end script & styles
└── types/session.d.ts
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）