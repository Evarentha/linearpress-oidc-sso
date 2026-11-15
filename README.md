# Single Sign-On

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-oidc-sso.svg)](https://www.npmjs.com/package/@evarentha/linearpress-oidc-sso) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

OpenID Connect / OAuth2 sign-in for LinearPress.

## Features

- Add providers with Discovery (the issuer URL fills in the endpoints); PKCE and request timeouts built in.
- Sign-in buttons on the login page; the core sign-in pipeline still applies (two-step verification, bans).
- Users link and unlink provider accounts at /account/connections; an account created through SSO keeps at least one way to sign in.
- Creating new accounts from SSO is off by default and respects “registration open”.

## Where to find it

- `/admin/sso`: providers and options

## Install

Bundled with LinearPress 4. Enable or disable it on the admin Plugins page; the change applies immediately, no restart. In another checkout, run `npm run sync -- oidc-sso` from LinearPress, or put this repository at `src/plugins/oidc-sso` (the directory name must equal the plugin id).

Requires LinearPress ^4.0.0. Works on SQLite and MySQL.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Source: https://github.com/Evarentha/linearpress-oidc-sso
