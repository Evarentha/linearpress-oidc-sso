<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# OIDC 单点登录（oidc-sso）

为 LinearPress 提供基于 **OIDC / OAuth2** 的单点登录能力。可自定义添加任意兼容 Authorization Code 流程的认证平台（学校/企业的统一身份认证、GitHub、GitLab、Keycloak、Authing、Okta、Azure AD 等），登录页顶部自动出现平台登录按钮。

- **插件 id**：`oidc-sso`
- **版本**：1.0.0
- **类型**：`both`
- **依赖**：无（Node 24 内置 `fetch` / `crypto`）

## 功能

1. **自定义认证平台**：任意 OAuth2 / OIDC 平台，配置 client_id/secret、授权地址、令牌地址、用户信息地址与字段映射即可。支持 **OIDC Discovery** 一键自动填充（填 `.well-known/openid-configuration` 地址即可生成配置）。
2. **回调地址可配置**：默认 `/sso-callback`，可在设置页修改（修改后需重启站点生效）。
3. **登录按钮**：登录页 **上方** 注入平台登录按钮；未配置任何平台时按钮不显示。
4. **自动注册**：未绑定任何站点账户的平台账号登录时，先**询问是否创建**账户（用户名/邮箱取自平台；用户名已存在时自动追加 `_openid` + openid 后四位）。可在设置中关闭：关闭后不再询问，仅允许已绑定用户登录。
5. **绑定 / 解绑**：已登录用户可绑定或解绑平台账号：
   - 已安装 [colorful-profiles] 时，在 **个人资料编辑页**（`/profile/edit`）操作；
   - 未安装时，在 **仪表盘**（`/admin`）操作。

## 安装

将本目录通过插件管理页 ZIP 安装器安装，或部署到宿主项目的 `src/plugins/oidc-sso`，然后重启 LinearPress。启用后进入后台「单点登录」菜单配置平台。

## 配置一个平台（示例：任意 OIDC）

1. 在认证平台后台创建应用，允许的回调地址填写：
   `https://你的站点/<回调路径>`（默认回调路径 `/sso-callback`）
2. 后台「单点登录」设置页：
   - 填写 **Discovery 地址**（如 `https://idp.example.com/.well-known/openid-configuration`）与 Client ID / Secret，点击「从 Discovery 生成并追加」；
   - 或手动插入 OIDC/OAuth2 模板后编辑 JSON；
3. 保存设置即可。登录页顶部将出现「通过 平台名 登录」按钮。

### providers JSON 字段

| 字段 | 说明 |
| --- | --- |
| `id` | 平台唯一标识（留空则由名称自动生成，路由使用） |
| `name` / `icon` | 展示名称 / 按钮图标（Emoji） |
| `enabled` | 是否启用（`false` 时按钮不显示、登录被拒绝） |
| `type` | `oidc` / `oauth2` / `other`（仅展示用） |
| `clientId` / `clientSecret` | 应用凭据 |
| `scope` | 授权 scope（OIDC 默认 `openid profile email`） |
| `authorizeUrl` / `tokenUrl` / `userInfoUrl` | 授权 / 令牌 / 用户信息端点 |
| `idField` | 平台账号唯一标识字段（OIDC 默认 `sub`） |
| `usernameField` | 用户名来源字段（默认 `preferred_username`，缺省时依次尝试 nickname/name） |
| `emailField` | 邮箱来源字段（默认 `email`） |
| `usePkce` | 可选：是否启用 PKCE (S256) |

> 用户名安全化：仅保留字母/数字/下划线/连字符；长度不足 3 字符时自动补齐；已被占用时按 `用户名_openid<sub 后四位>` 追加，仍冲突则继续追加 `-2`/`-3`。

## 与 easy-captcha / easy-2fa 的兼容

- **人机验证（easy-captcha）**：SSO 走独立回调路由（GET），不经过 `/login`，单点登录全程**不进行人机验证**。
- **两步验证（easy-2fa）**：
  - 用户已绑定两步验证 → SSO 登录完成后自动进入两步验证**挑战页**，验证通过才算登录完成；
  - 站点为 **严格开启** 且用户尚未绑定 → 自动跳转两步验证**绑定页**，完成绑定后继续；未完成绑定则登录不完整（后续请求会被拦回挑战/绑定页）；
  - 无需两步验证 → 直接登录成功。
  - 集成方式为零侵入：SSO 只写入标准登录会话（不标记 2FA 已通过），easy-2fa 的强制中间件自动接手挑战/绑定流程。

## 试用 / 本地验证

没有真实 IDP 时可部署一个本地测试平台验证完整流程：

```bash
# 任意支持 OIDC/OAuth2 的实现均可；最小可运行方案：
npx oidc-provider --port 4000   # 或本地部署 Keycloak / Dex 等
```

在插件设置页用其 Discovery 地址生成配置（回调填 `http://localhost:3000/sso-callback`）即可端到端验证登录、自动注册与绑定/解绑。

## 目录

```
oidc-sso/
├── plugin.json            # 插件清单
├── index.ts               # 路由、OAuth 流程、登录/绑定/设置
├── src/
│   ├── config.ts          # 配置模型：providers / 回调路径 / 自动注册
│   ├── oauth.ts           # 授权链接、令牌交换、UserInfo、Discovery、字段提取
│   └── store.ts           # sso_bindings 绑定表（跨 SQLite/MySQL 方言）
├── views/
│   ├── admin/oidc-sso-settings.ejs   # 设置页
│   └── web/sso-create.ejs            # 自动注册确认页
├── public/                # 登录页/资料页/仪表盘注入 + 设置页脚本与样式
└── types/session.d.ts     # ssoPending / ssoCreatePending 会话声明
```

[colorful-profiles]: https://git.linearteam.top/moyuzj/linearpress-colorful-profiles