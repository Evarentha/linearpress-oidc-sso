# OIDC SSO

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-oidc-sso.svg)](https://www.npmjs.com/package/@evarentha/linearpress-oidc-sso) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

Single sign-on for LinearPress through any OIDC or OAuth2 provider over the Authorization Code flow: Keycloak, Auth0, Okta, GitHub, enterprise and school identity servers. Providers are managed from the admin console, Discovery autofills the endpoints, unknown accounts can be registered behind a confirmation page, and logged-in users can bind and unbind provider accounts. The plugin uses only Node's built-in `fetch` and `crypto`; it has zero external dependencies.

You need an application registered on some provider, with a callback URL you control.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-oidc-sso.git src/plugins/oidc-sso
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh oidc-sso`), or upload the ZIP / npm name from the admin Plugins page, then open "单点登录" in the admin menu.

## Setting up a provider

Everything lives on `/admin/oidc-sso/settings`, stored as JSON in the plugin registry; managing providers requires the base `plugin:manage` permission. Per provider:

1. Register an application on the provider side with the callback URL set to `<your site origin>/<callback path>` (`/sso-callback` by default).
2. Add the provider on the settings page: name, icon, client id and secret, scope, authorize/token/userinfo URLs, and the field mapping for subject, username, and email. Paste the Discovery URL (`.well-known/openid-configuration`) and the endpoints autofill. Enable PKCE (S256) if the provider supports it.
3. Enable the provider. A "sign in with X" button appears above the login form, fed by the public list at `GET /sso/providers`.

Site-wide: the callback path can be changed on the same page and takes effect after a restart. Auto-registration can be turned off, in which case only provider accounts already bound to site users can sign in.

The settings page edits a JSON structure of this shape (Discovery fills the three URLs; the server generates the provider `id` on save, so you can omit it):

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

## The sign-in flow

An unknown provider account lands on a confirmation page before any account is created. Usernames are sanitized to unicode letters, numbers, underscore, and hyphen; a duplicate name gets an `_openid` suffix followed by the tail of the provider's subject ID, and further collisions add `-2`, `-3`, and so on. Logged-in users bind and unbind from the profile page (colorful-profiles' page when installed, the dashboard otherwise), and binding an account already bound to another user returns a 409.

The security baseline: CSRF state with expiry, one-time pending states, a `safeReturnPath` open-redirect guard, and session regeneration on login. No site passwords are involved; an SSO login writes a standard session.

Two coexistence details. The callback is a separate GET route, so SSO sign-in never passes through easy-captcha's `/login` check. And an SSO login does not set `easy2faPassed`, so easy-2fa's middleware takes over naturally when that plugin is active. Neither plugin needs a change for either behavior.

## Data

Provider configuration is stored as JSON in the plugin registry through the plugin config service. The `sso_bindings` table maps provider accounts to site users on a composite key of `provider` plus `sub`, with a username and email snapshot refreshed at every login.

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
