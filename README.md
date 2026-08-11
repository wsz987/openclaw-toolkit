# OpenClaw Toolkit · 国内源自动安装工具

> 面向国内环境的 OpenClaw（AI Agent 运行时）一键式部署与管理桌面工具。
> 集成固定版本、适配国内镜像源，支持飞书 / 钉钉 / QQ 机器人 / 微信多渠道扫码接入，
> 内置主流国产大模型供应商快速接入与常用 Skill，开箱即用。

OpenClaw Toolkit 是一套 **Tauri 桌面安装器 + 管理面板 + 更新服务端** 的完整方案。它把「下载 Node 运行时 → 安装 OpenClaw → 生成配置 → 接入 IM 渠道 → 配置模型供应商 → 部署 Skill → 启动运行」这一整套繁琐流程封装成向导式界面，用户只需要选择安装目录、扫码、填密钥，几分钟即可跑起一个可用的 OpenClaw Agent。

---

## ✨ 功能特色

### 🚀 一键式自动化安装
- **三步向导**：环境预检 → 安装配置 → 进度与校验，实时展示安装日志与进度。
- **三种安装模式**：
  - **内置稳定版**：使用随包发布的离线制品，无需联网即可安装；
  - **远程服务器**：从内部配置的远程服务器拉取版本清单与制品；
  - **官方 npm（国内镜像）**：从 `registry.npmmirror.com` 拉取版本列表，自动过滤预发布版并选取兼容的受管 Node 运行时。
- **版本锁定**：每个 OpenClaw / Node 版本均以 `sha256` 校验，Node 版本按 `requiredNode.range` 自动匹配。
- **受管 Node 运行时**：工具包自身不依赖全局 Node.js、不写入系统 PATH、不安装全局 npm；Node 仅作为 OpenClaw 的被管理运行环境（安装于独立目录），并提供国内镜像 `.npmrc`（npm 源 / node 镜像 / electron 镜像 / playwright 下载源）。
- **失败回滚**：安装前自动备份旧目录与 `openclaw.json`，失败进入回滚并保留现场日志。

### 📱 多渠道扫码接入（IM 通知/入口）
内置主流国内 IM 渠道的对接向导，无需手写配置文件，**扫码即可完成授权**：
- **飞书 / Lark**：OAuth 设备授权二维码，自动回填凭证，支持 `feishu` 与 `lark` 域名；
- **钉钉**：钉钉官方设备流二维码，扫码后自动填充 Client ID / Secret；
- **QQ 机器人**：QQ 开放平台 ptlogin2 扫码登录，输入 AppID / AppSecret 完成接入；
- **微信**：复用官方 `openclaw-weixin` 插件，支持验证码、多账号、已绑定/需跳转节点等场景。

每个渠道均提供：插件一键安装/卸载、启用/停用开关、官方文档与开放平台控制台直达链接、权限排查清单。

### 🤖 国产大模型供应商快速接入
内置 **9 大供应商**（全部 OpenAI-compatible），点选卡片即自动填充 `baseUrl` 与默认模型：
火山引擎 Ark Agent Plan / Ark、阿里云百炼（qwen）、DeepSeek、Kimi（moonshot）、智谱 GLM、OpenAI、小米 MiMo、MiniMax。

- 推荐模型以可点击 Chip 形式快速填充；
- 「测试端点连接」一键校验 API 可用性；
- 保存后自动写入 `openclaw.json`、设置主模型、配置 Agent 安全策略（默认将工具限制在工作区内），并标记运行时需重启。

### 🧩 内置 Skill 管理
内置一批常用 Skill 目录（如 `browser-control`、`local-filesystem`、`multi-search-engine`、`byted-web-search`、`byted-ark-seedance/seedream`、`nano-pdf`、`humanizer`、`markdown-converter`、`self-improving-agent`、`skill-vetter` 等）。
一键启用即自动安装到工作区并写入 `agents.defaults.skills` 白名单，禁用则移除。

### ⚙️ 运行时生命周期管理
- 桌面端全权管理 OpenClaw 进程：**启动 / 停止 / 重启**、状态机（停止/启动中/运行中/停止中/失败）、60 秒启动超时、网关存活/就绪探针、异常时进程树清理；
- 桌面重启后自动**接管已在运行的网关**，保持状态一致；
- 实时状态徽标、运行 PID、控制台地址（默认 `http://127.0.0.1:18789`）、已启用插件与已装 Skill 列表；
- **终端风格实时日志**（1 秒自动刷新、ANSI 着色、自动跟随底部）。

### 🖥️ 桌面端使用细节
- **系统托盘**常驻：显示主界面 / 开机自启（可勾选）/ 退出；
- 关闭窗口最小化到托盘，`--start-hidden` 参数支持开机静默启动；
- 支持 **Tauri 自动更新**（每 6 小时 + 启动即查一次）。

---

## 🛠️ 技术架构

```text
┌─────────────────────────────────────────────────────────────┐
│  Tauri Desktop UI (React / Vite / Tailwind / shadcn-ui)     │
│  负责展示、表单、进度、日志，通过 invoke 调用 Rust Core      │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Tauri Rust Core                                            │
│  Workflow Engine · Manifest/版本目录管理 · License 校验      │
│  Artifact 安装器 · openclaw.json 生成 · Node Runtime 管理   │
│  Skill 安装器 · 权限管理 · 渠道接入 · 进程/运行时管理        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw Managed Runtime (受管 Node Runtime)               │
│  runtimes/node/<ver>/node.exe · openclaw/<ver>/ · workspace │
│  skills/ · logs/ · backups/                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Server 管理控制台 (Next.js + SQLite/Drizzle)               │
│  版本/更新管理 · 制品下载 · 自动更新                        │
└─────────────────────────────────────────────────────────────┘
```

核心设计原则：**工具包自身不内置 Node Core、不要求全局 Node.js、不写系统 PATH**；Node.js 只作为 OpenClaw 的被管理运行环境存在。

---

## 📁 目录结构

```text
apps/
  desktop/        # Tauri 桌面应用（React 前端 + Rust Core）
  server/         # Next.js 管理控制台（版本更新 / SQLite）
artifacts/        # 离线制品：openclaw 包、node 运行时、插件、技能、providers 等
scripts/          # 工具脚本（插件卸载等）
docs/             # 架构与实现文档
```

---

## 🚀 快速开始

### 环境要求

| 组件 | 说明 |
| --- | --- |
| Node.js ≥ 20 | 前端构建与工具链 |
| pnpm ≥ 9 | 包管理（workspace 已配置） |
| Rust (stable) | Tauri 桌面端编译 |
| Tauri CLI | `@tauri-apps/cli`（随 workspace 安装） |

### 安装依赖

```bash
pnpm install
```

### 启动桌面端（开发模式）

```bash
# 启动 Tauri 桌面应用
pnpm dev:desktop
```

### 启动管理控制台（开发模式）

```bash
# 启动 Next.js 服务端（默认 127.0.0.1:31421）
pnpm dev:server
```

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 构建桌面端 |
| `pnpm typecheck` | 桌面端类型检查 |
| `pnpm test:server` | 服务端单元测试 |
| `pnpm --filter @openclaw-toolkit/server db:push` | 初始化 / 同步 SQLite 数据库 |

> 服务端需先初始化数据库（`db:push`）并设置 `SERVER_ADMIN_TOKEN` 环境变量以保护管理后台。

---

## 📖 使用说明

### 安装 OpenClaw
1. 启动桌面工具，进入安装向导；
2. 选择**安装目录**与**安装模式**（内置稳定版 / 远程服务器 / 官方 npm 国内镜像）；
3. 等待环境预检与安装进度，完成后自动生成配置并校验运行时。

### 接入 IM 渠道
在「渠道」面板选择目标渠道（飞书 / 钉钉 / QQ / 微信），点击**扫码登录**，手机扫码后凭证自动回填；随后可一键安装对应官方插件并启用该渠道。

### 配置模型供应商
在「供应商」面板点选卡片（如火山引擎、DeepSeek、Kimi、智谱等），填入 API Key，点击**测试端点连接**验证，保存后即完成主模型与安全策略配置。

### 部署 Skill
在「技能管理」面板浏览内置技能目录，一键启用/停用，启用后自动安装到工作区并写入白名单。

### 管理运行时
在「运行时」面板查看实时状态、控制台地址与实时日志，支持启动 / 重启 / 停止，以及打开控制面板、主程序目录、日志目录。

---

## 🔄 服务端管理控制台（桌面自动更新后端）

`apps/server` 提供一个轻量的 Next.js 后台，作为桌面端的**自动更新服务器**，主要能力：

- **版本管理**：配置更新服务器地址、上传 Tauri 更新包与签名，按渠道控制发布与资产启用状态；
- **自动更新**：桌面端通过 `GET /api/v1/desktop/updates/:target/:arch/:version` 获取更新元数据，从下载接口拉取安装包完成静默升级。

> **更新服务器地址是可配置的**。仓库中以 `https://YOUR-UPDATE-SERVER.invalid`（保留 TLD，永不解析）作为占位地址，不会暴露任何私有基础设施。部署者可：
>
> - 桌面端：通过环境变量 `OPENCLAW_REMOTE_SERVICE_BASE_URL` / `OPENCLAW_REMOTE_SERVICE_FALLBACK_BASE_URL` 配置（Rust 侧读取），或编辑 `apps/desktop/src-tauri/tauri.conf.json` 的 `plugins.updater.endpoints`；
> - 服务端：通过 `PUBLIC_SERVER_BASE_URL` 环境变量配置对外公开地址。
>
> 若不需要自动更新，保留占位地址即可（更新检查不会命中，不影响安装与运行）。

---

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri v2（Rust） |
| 前端 | React 19 · Vite · Tailwind CSS 4 · shadcn/ui · Radix UI · lucide-react |
| 后端运行时 | Rust（Tauri command / workflow engine） |
| 管理服务端 | Next.js 15 · React 19 · Tailwind |
| 数据库 | SQLite（better-sqlite3）· Drizzle ORM |
| 包管理 | pnpm workspace · TypeScript |

---

## 📄 开源协议

本项目采用 **MIT License** 开源，允许自由使用、修改、商用与分发，需保留版权声明。详见 [LICENSE](LICENSE)。

---

## 🧭 Roadmap（规划）

- [ ] 更多 IM 渠道接入（Telegram、Slack、Discord 等）
- [ ] 更多国产模型供应商与私有模型网关支持

---

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw) —— 本项目部署与管理的 AI Agent 运行时
- [Tauri](https://tauri.app) / [React](https://react.dev) / [Next.js](https://nextjs.org) / [Drizzle](https://orm.drizzle.team) 等开源生态

---

如有问题，欢迎提 [Issue](https://github.com/wsz987/auto-tools-install/issues) 或提交 Pull Request。
