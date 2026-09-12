# OIDC 单点登录（oidc-sso）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-oidc-sso.svg)](https://www.npmjs.com/package/@evarentha/linearpress-oidc-sso) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 接入任意 OIDC / OAuth2 平台的授权码流程单点登录，Keycloak、Auth0、Okta、GitHub、企业与校园身份服务器均可使用。认证平台在后台统一管理，Discovery 一键填充端点，陌生账号须先经确认页方可注册，已登录用户可绑定与解绑平台账号。本插件仅使用 Node 内置的 `fetch` 与 `crypto`，零外部依赖。

使用前需在某一平台注册应用，并掌握回调地址。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-oidc-sso.git src/plugins/oidc-sso
```

目录名必须与插件 id 一致，安装后需重启 LinearPress。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh oidc-sso`，或在后台插件页上传 ZIP、填写 npm 包名，随后打开后台菜单的「单点登录」。

## 配置认证平台

全部配置位于 `/admin/oidc-sso/settings`，以 JSON 形式存储于插件注册表；管理平台需要基础权限 `plugin:manage`。每个平台三步：

1. 在平台侧注册应用，回调地址设为 `<站点源>/<回调路径>`（默认 `/sso-callback`）。
2. 在设置页添加平台：名称、图标、client id 与 secret、scope、授权 / 令牌 / 用户信息端点，以及 subject、用户名、邮箱的字段映射。粘贴 Discovery 地址（`.well-known/openid-configuration`）即可自动填充端点；平台支持时建议启用 PKCE（S256）。
3. 启用该平台。登录表单上方将出现「通过 X 登录」按钮，数据来自公开的 `GET /sso/providers`。

全站层面：回调路径可在同一页面修改，重启后生效；自动注册可以关闭，关闭后仅已绑定站点用户的平台账号可以登录。

设置页编辑的即是如下结构的 JSON（Discovery 会填充三个端点地址；服务端在保存时生成平台 `id`，可省略不填）：

```json
{
  "callbackPath": "/sso-callback",
  "autoRegister": true,
  "providers": [
    {
      "name": "Keycloak",
      "icon": "K",
      "enabled": true,
      "clientId": "linearpress",
      "clientSecret": "…",
      "scope": "openid profile email",
      "authorizeUrl": "https://idp.example.com/auth",
      "tokenUrl": "https://idp.example.com/token",
      "userInfoUrl": "https://idp.example.com/userinfo",
      "usePkce": true,
      "idField": "sub",
      "usernameField": "preferred_username",
      "emailField": "email"
    }
  ]
}
```

## 登录流程

来自平台的陌生账号将先进入确认页，经确认后才会创建账号。用户名清洗为 unicode 字母、数字、下划线与连字符；重名时追加 `_openid` 后缀并附平台 subject 的尾部字符，再次冲突则追加 `-2`、`-3` 等。已登录用户在资料页执行绑定与解绑（安装 colorful-profiles 时位于其资料页，否则位于仪表盘）；将已属于其他用户的平台账号绑至自身将返回 409。

安全基线：带过期的 CSRF state、一次性 pending 状态、`safeReturnPath` 防开放重定向、登录时重建会话。全程不涉及站点密码，SSO 登录写入的是标准会话。

两项值得说明的共存设计：回调为独立的 GET 路由，SSO 登录不经过 easy-captcha 的 `/login` 校验；SSO 登录不设置 `easy2faPassed`，easy-2fa 的中间件在该插件启用时自然接管。上述行为均无须任何插件为此修改代码。

## 数据

平台配置以 JSON 形式存储于插件注册表，经由插件配置服务读写。`sso_bindings` 表以 `provider` 与 `sub` 的复合键将平台账号映射至站点用户，每次登录刷新用户名与邮箱快照。

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
