# 单点登录

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-oidc-sso.svg)](https://www.npmjs.com/package/@evarentha/linearpress-oidc-sso) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 提供 OpenID Connect / OAuth2 登录。

## 功能

- 添加身份提供方时可用 Discovery 自动填写各个地址；内置 PKCE 和请求超时。
- 登录页显示对应按钮；核心登录流程照常生效（两步验证、封禁）。
- 用户在 /account/connections 关联或解除账号；通过单点登录创建的账号至少保留一种登录方式。
- 通过单点登录创建新账号默认关闭，并遵守“是否开放注册”。

## 入口

- `/admin/sso`：身份提供方和选项

## 安装

LinearPress 4 已内置。在后台“插件”页启用或停用，立即生效，无需重启。其他安装方式：在 LinearPress 目录执行 `npm run sync -- oidc-sso`，或把本仓库放到 `src/plugins/oidc-sso`（目录名必须等于插件 id）。

需要 LinearPress ^4.0.0，支持 SQLite 和 MySQL。

## 许可

GPL-3.0-or-later，见 [LICENSE](LICENSE)。

源码：https://github.com/Evarentha/linearpress-oidc-sso
