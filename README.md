<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# OIDC 单点登录（oidc-sso）

为 LinearPress 提供基于 **OIDC / OAuth2（Authorization Code）** 的单点登录：
可自定义添加任意兼容的认证平台（学校/企业统一身份、GitHub、GitLab、Keycloak、Authing、Okta、Azure AD 等），
登录页顶部自动出现平台登录按钮。

> 本仓库是 LinearPress 插件 **oidc-sso** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。
> 依赖：无（Node 24 内置 `fetch` / `crypto`）。

## 插件化的优势

- **认证外置不改核心**：SSO 走独立回调路由（GET），不经 `/login`，与 easy-captcha 的人机验证全程不冲突（SSO 登录不经过人机验证）。
- **两处绑定入口**：装 colorful-profiles 时在个人资料编辑页绑定/解绑，否则在仪表盘操作——靠 Hook 挂载，双方都不用改代码。
- **自动注册可控**：未绑定平台账号默认在登录时询问是否创建账户（可关闭仅允许已绑定登录），用户体系零冲突。

## 功能

1. **自定义认证平台**：填 client_id/secret、授权/令牌/用户信息地址与字段映射即可；支持 **OIDC Discovery** 一键自动填充（填 `.well-known/openid-configuration`）。
2. **回调地址可配置**：默认 `/sso-callback`（修改后需重启）。
3. **登录按钮**：登录页**上方**注入平台登录按钮；未配置平台时不显示。
4. **自动注册/绑定**：用户名已存在自动追加 `_openid` + openid 后四位；用户名安全化（仅字母/数字/下划线/连字符，短名补齐，冲突继续 `-2/-3`）。
5. **绑定/解绑**：个人资料编辑页或仪表盘。

## 安装

```bash
# 方式一：工作区同步
cd base && sh scripts/sync-plugins.sh oidc-sso

# 方式二：克隆到运行目录（目录名必须等于插件 id）
git clone <本仓库地址> src/plugins/oidc-sso
```

启用后进入后台「单点登录」菜单配置平台。

## 配置一个平台（示例：任意 OIDC）

1. 在认证平台创建应用，回调地址填 `https://你的站点/<回调路径>`（默认 `/sso-callback`）。
2. 后台「单点登录」：填写 Discovery 地址与 Client ID / Secret →「从 Discovery 生成并追加」；或手动插入 OIDC/OAuth2 模板编辑。
3. 保存即可，登录页顶部出现「通过 平台名 登录」。

providers JSON 关键字段：`id / name / icon / enabled / type(oidc|oauth2) / clientId / clientSecret / scope / authorizeUrl / tokenUrl / userInfoUrl / idField(sub) / usernameField / emailField / usePkce`。

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone <本仓库地址> LinearPress/Plugins/oidc-sso
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh oidc-sso
npm run dev
```

## 目录结构

```text
oidc-sso/
├── plugin.json            # Manifest
├── index.ts               # 入口：SSO 回调、绑定/解绑、登录按钮注入
├── src/
│   ├── config.ts          # providers 配置模型
│   ├── oauth.ts           # OIDC/OAuth2 流程 + Discovery
│   └── store.ts           # 绑定关系存储
├── views/                 # 登录页按钮注入、后台设置页
├── public/                # 前端脚本与样式
└── types/session.d.ts
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）