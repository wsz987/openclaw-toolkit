# 🎬 byted-ark-seedance-skill v3.0.0

> 火山方舟 Agent Plan 专属视频生成 Skill - 零依赖、开箱即用、架构优雅。

---

## ✨ 核心特性

### 🚀 零依赖开箱即用
- 无需 `npm install`，无任何第三方包
- 纯 Node.js 内置模块实现
- 智能三层鉴权，平台专属配置 + 通用环境变量兜底

### 🧠 智能原生体验
- 自动根据用户输入选择最优模型（2.0 / 2.0 fast / 1.5 pro）
- 自动识别首尾帧场景（1 张图 = 首帧，2 张图 = 首帧 + 尾帧）
- 参数自动兼容：下划线/中划线写法都支持

### 📋 透明状态管理
- 使用 `.pending-tasks.json` 管理任务队列
- 会话重启不丢失任务
- 大模型可读可查，状态完全透明

### 🔔 完美的异步体验
- `create` 采用智能调度：普通任务默认前台等待，长任务自动转后台异步生成
- 配合 Agent 框架 Cron 实现完成后自动推送
- 完成后自动下载视频到本地

### 🛡️ 多任务安全隔离
- 每个任务独立目录，永不覆盖
- 自动适配所有运行环境，三级目录 fallback

---

## 🚀 快速开始

### 前置要求
- Node.js 18+
- 火山方舟 API Key 已配置（自动检测，无需手动设置）

### 生成你的第一个视频

```bash
# 1. 提交视频任务（瞬间返回，不阻塞）
node scripts/seedance-wrapper.js create \
  --prompt "一只可爱的小猫在阳光下的草地上奔跑，高清画质" \
  --duration 5 \
  --ratio "16:9"

# 2. 检查任务进度（完成后自动下载）
node scripts/seedance-wrapper.js check-pending

# 3. 或查询指定任务
node scripts/seedance-wrapper.js get --task-id cgt-xxx
```

---

## 📖 完整命令列表

| 命令 | 说明 |
|------|------|
| `create` | 提交视频生成任务 |
| `check-pending` | 批量检查所有待完成任务，完成后自动下载 |
| `get --task-id <id>` | 查询单个任务状态 |
| `list [--filter-status <status>]` | 列出任务列表，支持按状态过滤 |
| `delete --task-id <id>` | 取消/删除指定任务 |
| `help` | 显示帮助 |

---

## ⚙️ 核心参数

完整参数列表请参考 [SKILL.md](SKILL.md)，常用参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--prompt` | 视频描述提示词 | ✅ 必填 |
| `--duration` | 视频时长（秒） | `5` |
| `--ratio` | 视频比例 | `"adaptive"` |
| `--resolution` | 分辨率 | `"720p"` |
| `--image-file` | 本地参考图片（多张可重复使用） | - |
| `--video-file` | 本地参考视频 | - |
| `--generate-audio` | 是否自动生成音频 | `true` |
| `--camera-fixed` | 是否固定镜头视角 | `false` |
| `--draft` | 样片预览模式（仅 1.5 pro） | `false` |
| `--service-tier` | 服务等级（default/flex） | `"default"` |
| `--enable-web-search` | 联网搜索（仅 2.0 系列） | `false` |
| `--api-key` | Agent Plan 专属 API Key（默认仅本次临时使用） | - |
| `--save-api-key` | **显式确认才使用**：将 API Key 保存为当前平台的全局 Agent Plan Key（影响语言模型、生图、生视频、Embedding 等所有能力） | `false` |

---

## 🎯 典型使用场景

### 🖼️ 首帧生视频

```bash
node scripts/seedance-wrapper.js create \
  --prompt "日落海边的唯美场景，海鸥飞过" \
  --image-file "/path/to/start.jpg"
```

### 🎞️ 首尾帧过渡视频

```bash
node scripts/seedance-wrapper.js create \
  --prompt "从日出到日落的时间流逝" \
  --image-file "/path/to/sunrise.jpg" \
  --image-file "/path/to/sunset.jpg"
```

### 🎵 参考音频生视频

```bash
node scripts/seedance-wrapper.js create \
  --prompt "配合音乐节奏变化的抽象光影" \
  --audio-file "/path/to/music.mp3"
```

### 💰 低成本离线生成

```bash
node scripts/seedance-wrapper.js create \
  --prompt "城市夜景延时摄影" \
  --service-tier "flex"
```

---

## 🔔 主动通知配置（推荐）

配合支持后台 Cron 的 Agent 框架（如 OpenClaw），配置每 2 分钟执行一次：

```yaml
schedule: every 2 minutes
command: node scripts/seedance-wrapper.js check-pending
```

**效果**：用户提交任务后可以去聊别的，视频生成好后 Agent 会主动推送通知和本地文件路径。

---

## 📂 文件保存位置

视频自动保存（三级自动 fallback，适配所有运行环境）：

| 优先级 | 路径 | 适用场景 |
|-------|------|---------|
| 1 | `~/Desktop/Seedance-Videos/<task-id>/` | 桌面用户（Mac/Windows），默认优先 |
| 2 | `~/Seedance-Videos/<task-id>/` | Linux 服务器、无头环境 |
| 3 | `./Seedance-Videos/<task-id>/` | 极端情况（home 目录不可写） |

✅ 自动检测目录权限，自动选择可用路径。每个任务独立目录，永不覆盖。

---

## 🔑 API Key 配置（三层优先级）

Skill 会按以下优先级查找 API Key，真正做到「零配置开箱即用」：

### 🥇 第一层（最高优先级）：用户对话中显式传入
当用户直接在对话中发送 Agent Plan 专属 API Key 时，Agent 层通过参数传给 Skill：
```bash
# ✅ 默认仅本次临时使用，不保存到全局配置
node scripts/seedance-wrapper.js create --prompt "..." --api-key "ark-xxx"

# ✅ 仅当用户明确要求「保存/以后使用这个 Key」时，才加 --save-api-key
node scripts/seedance-wrapper.js create --prompt "..." --api-key "ark-xxx" --save-api-key
```
> ✅ Skill 会自动校验 Key 是否Agent Plan 专属。
> 
> ⚠️ **默认仅临时使用**：由于 Agent Plan API Key 是当前平台的全局 Key，会影响语言模型、生图、生视频、Embedding 等所有能力，因此默认不自动保存到配置。只有用户明确要求保存时，才传入 `--save-api-key`。

### 🥈 第二层（平台专属检测）：根据当前运行工具读取配置
Skill 自动检测当前运行平台，并从对应位置读取：
- **Claude Code**：`~/.claude/settings.json` 中的 `env.ANTHROPIC_AUTH_TOKEN`（或会话环境变量）
- **OpenClaw**：`~/.openclaw/openclaw.json` 中的 `models.providers.*.apiKey`
- **Hermes**：`~/.hermes/config.yaml` 中的 `model.api_key`

### 🥉 第三层（通用兜底）：6 种通用环境变量
如果无法识别平台，则自动查找以下通用命名的环境变量：
1. `ANTHROPIC_AUTH_TOKEN`
2. `API_KEY`
3. `API_Key`
4. `API_Keys`
5. `api_key`
6. `apiKey`

> 💡 **安全原则**：只有当用户明确说「保存这个 Key / 以后都用这个 / 替换全局 Key」时，Agent 层才应追加 `--save-api-key` 参数，写入当前平台的 Agent Plan 标准配置（如 OpenClaw 的 `volcengine-plan`），保存后所有相关功能都可以直接复用，无需重复输入。
> 
> ⚠️ 不会默认读取通用的 `ARK_API_KEY` 环境变量，避免误用火山其他业务的 API Key。

### ❌ 都没找到：明确提示用户
如果以上都没有配置，Skill 会明确提示：
> 请在对话中发送 Agent Plan 专属 API Key，或在当前工具中配置。

---

## 🤖 Agent 层最佳实践

1. **文件处理**：有本地路径直接传 `--image-file`，有在线链接直接传 `--image-url`，不需要自行转换 Base64
2. **模型选择**：不需要手动指定模型，Skill 会根据参数自动选择最优模型
3. **阻塞策略**：用户没说要等就用 `create` + 主动通知；用户明确说要等才用 `--wait true`

---

## 📋 状态文件说明

任务队列保存在 `.pending-tasks.json` 中（自动创建）：

```json
[
  {
    "task_id": "cgt-xxx",
    "prompt": "用户的提示词",
    "model": "doubao-seedance-2.0",
    "created_at": 1714310400000
  }
]
```

可随时查看、编辑、备份，完全透明可控。

---

## 📄 详细文档

- [SKILL.md](SKILL.md) - 大模型使用指南 + 完整参数说明
- 脚本代码均有详细注释，可直接阅读源码了解实现细节

---

## 🎉 版本信息

- **版本**: v3.0.0
- **适用**: 火山方舟 Agent Plan 专属
- **许可证**: MIT
- **作者**: volcengine/agentplan

---

## 💡 为什么用这个版本？

- **零依赖**：不需要 `npm install`，下载就能用
- **原生体验**：与 Agent Plan 无缝集成，自动复用 API Key
- **智能省心**：自动选模型、自动判首尾帧、自动兼容参数写法
- **透明可控**：JSON 状态管理，看得见摸得着，随时可改
- **架构安全**：无后台进程、无数据库、无注入风险

**直接拿来用，不会让你失望！** ✅
