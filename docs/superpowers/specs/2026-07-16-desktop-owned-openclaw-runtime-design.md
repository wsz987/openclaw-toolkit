# Desktop-Owned OpenClaw Runtime Design

## 目标

在不引入常驻 Host daemon 或系统服务的前提下，让桌面应用启动的 OpenClaw Gateway 稳定运行，并保证 React 页面刷新、路由切换和窗口隐藏不会影响 Gateway 进程。

产品生命周期规则如下：

- 同一台机器同一时间只允许一个受管 OpenClaw 实例运行。
- OpenClaw 仅由用户点击“启动”后运行，不随桌面应用或 Windows 自动启动。
- React 页面刷新、WebView 重载、窗口隐藏到托盘不会停止 OpenClaw。
- 用户通过托盘“退出应用”、安装更新退出或系统正常结束应用时，桌面端停止 OpenClaw。
- 桌面端异常崩溃时不依赖清理逻辑；若 OpenClaw 残留，下次启动桌面端后识别并接管。
- OpenClaw 自身异常退出后不自动重启，界面显示失败状态并等待用户再次启动。

## 现状问题

当前链路为：

```text
React UI
  -> Tauri command
  -> openclaw-host start
  -> spawn-daemon
  -> command.json / result.json
  -> node openclaw.mjs gateway
```

这个架构解决的是“桌面应用退出后仍由独立控制面长期托管 OpenClaw”，但当前产品并不需要无人值守运行、自动重启或机器级服务。它引入了不必要的状态与故障面：

- helper 冷启动与客户端超时竞争；
- daemon、Gateway 和安装注册表存在三份运行状态；
- 文件 IPC 需要处理残留命令、结果和 PID；
- stdout/stderr 被丢弃时难以诊断 daemon 初始化失败；
- 启动调用串行叠加 daemon-ready 和 command-result 两段等待；
- GUI、status watcher 和 daemon 都在协调同一个 Gateway 生命周期。

2026-07-16 的真实核验中，首次启动等待超时，但 daemon 随后出现；第二次启动立即成功。这说明当前失败发生在控制面冷启动，而不是 OpenClaw Gateway 本身。

## 推荐架构

```text
React UI
  | invoke + openclaw://status-changed
  v
Tauri Runtime Commands
  | thin adapters
  v
RuntimeManager (Tauri managed state)
  |-- single-instance lifecycle state machine
  |-- serialized start / stop / restart
  |-- process identity and recovery
  |-- runtime snapshot
  v
RuntimeProcessAdapter
  |-- managed Node process creation
  |-- process/port ownership checks
  |-- bounded stop with force fallback
  v
node.exe openclaw.mjs gateway
  |-- 127.0.0.1:18789
  `-- logs/gateway-runtime.log
```

`RuntimeManager` 是唯一的生命周期协调者。React 不持有 PID，不等待 Gateway 完全 ready 才维持操作状态；安装注册表只保存恢复快照，不作为实时状态真相。

## 组件边界

### React UI

- 发送 `start / stop / restart / status` 请求。
- 订阅 `openclaw://status-changed`。
- 根据后端状态显示 `stopped / starting / running / stopping / failed`。
- `gatewayReady=false` 且进程仍为 `running` 时显示“运行中，尚未就绪”，不得提供第二次启动入口。
- 页面刷新后重新查询状态，不推断进程是否存活。

### Runtime Commands

- 校验 `configPath`。
- 调用 `RuntimeManager`。
- 将 `RuntimeSnapshot` 转换为现有 camelCase Tauri 响应。
- 不直接创建进程、不调用 `taskkill`、不修改 lifecycle 状态。

### RuntimeManager

- 通过进程内互斥锁串行化启停操作。
- 维护唯一的 `RuntimeSnapshot`。
- 实现幂等启动和幂等停止。
- 协调轻量状态探测，不执行插件发现。
- 在应用重新启动时验证并接管残留的受管 Gateway。
- 不实现自动重启。

### RuntimeProcessAdapter

- 根据 `OpenClawRuntimeContext` 启动受管 Node。
- 使用显式前台命令 `openclaw gateway run`；在本项目中等价为受管 Node 执行 `openclaw.mjs gateway run`。
- 将 stdout/stderr 追加到 `gateway-runtime.log`，不使用无人消费的 pipe。
- 仅在用户点击启动后的 preflight 中执行一次 `openclaw gateway status --json --deep`，检查官方 Scheduled Task、Startup-folder 服务和 `extraServices`；watcher 不执行该 CLI 命令。
- 按官方 JSON 的嵌套结构读取 `service.loaded` 和 `service.runtime`；同时兼容新版本可能返回的 `service.installed`、`service.running`，不自定义扁平状态字段。
- 高频探测使用官方 `/healthz` 和 `/readyz`，不重复执行 CLI 状态命令。
- 正常停止优先调用同一配置环境下的 `openclaw gateway stop --json`，复用官方对未托管 Gateway 的 PID 验证。
- 仅当官方停止超时，才查询端口所有者与进程身份，并对本次桌面会话创建且身份仍匹配的 PID 执行强制树终止。

### StatusWatcher

- 调用 `RuntimeManager::reconcile` 推进轻量生命周期状态。
- `starting` 时以 500 ms 频率探测，`running` 时以 2.5 秒探测，`stopped/failed` 时以 10 秒探测。
- `/healthz` 只表示 Gateway HTTP 存活；只有 `/readyz` 成功才表示插件、渠道和 hooks 已完成启动。
- readiness 与进程生命周期分开保存；已进入 `running` 的进程如果 `/readyz` 暂时转红，保持 `running` 并标记 `gatewayReady=false`，不能转为可重新启动的 `failed`。
- 只有状态发生语义变化时更新安装注册表并发送事件。
- 丰富状态读取仍可使用现有插件缓存，但不得阻塞 RuntimeManager 的启动路径。

## OpenClaw 官方契约

本设计依赖以下 OpenClaw 官方行为：

- `openclaw gateway run` 是无系统服务时的显式前台运行方式。
- `OPENCLAW_CONFIG_PATH`、`OPENCLAW_STATE_DIR` 和 `OPENCLAW_HOME` 是官方路径覆盖变量。
- `/healthz` 是 liveness；`/readyz` 是 usable readiness。
- `openclaw gateway stop --json` 在没有系统服务时会查找并验证监听端口的 Gateway PID，再发送停止信号。
- 官方通常建议一台机器运行一个 Gateway；如果使用多个实例，必须隔离端口、配置、状态目录和工作区。
- 官方 `gateway start/stop/restart` 的主要语义是管理 launchd、systemd 或 Windows Scheduled Tasks。当前产品不安装该服务，因此必须在启动前识别并拒绝与官方服务并存。
- 当前安装的 `2026.5.20` 中，`gateway status --json --deep` 的服务状态位于 `service.loaded` 和 `service.runtime`，额外服务位于 `extraServices`；解析器还应容忍官方新版本增加的 `service.installed`、`service.running`。该命令只用于低频启动冲突检查，不作为运行态健康轮询接口。

参考：

- <https://docs.openclaw.ai/cli/gateway>
- <https://docs.openclaw.ai/platforms/windows>

## 状态模型

```text
stopped --start accepted--> starting --gateway ready--> running
   ^                          |                         |
   |                          | timeout / process exit  | process exit
   |                          v                         v
   +<------stop complete---- failed <------------------+

starting --stop--> stopping --complete--> stopped
running  --stop--> stopping --complete--> stopped
failed   --start--> starting
```

状态定义：

- `stopped`：没有已验证的受管进程，Gateway 端口未被受管实例占用。
- `starting`：已创建受管 Node；PID 可以存活且 `/healthz` 可以成功，但 `/readyz` 尚未成功。
- `running`：Gateway 曾通过 `/readyz`，且 PID 身份和端口所有权仍有效。当前 `/readyz` 暂时失败时通过 `gatewayReady=false` 表示降级，但生命周期仍为 `running`。
- `stopping`：停止操作已开始，禁止新的启动或重启操作并发执行。
- `failed`：进程提前退出、启动超时、端口冲突或身份验证失败；不自动重启。

`RuntimeSnapshot` 至少包含：

```rust
pub struct RuntimeSnapshot {
    pub state: RuntimeLifecycleState,
    pub config_path: Option<PathBuf>,
    pub pid: Option<u32>,
    pub log_path: Option<PathBuf>,
    pub started_at: Option<DateTime<Utc>>,
    pub ready_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub adopted: bool,
    pub gateway_live: bool,
    pub gateway_ready: bool,
}
```

## 启动流程

1. Runtime command 调用 `RuntimeManager::start(configPath)`。
2. Manager 获取进程内 operation lock，并打开安装目录下的跨进程启动锁。
3. 读取轻量 `OpenClawRuntimeContext`，不调用 `plugins list`。
4. 使用同一组 OpenClaw 路径环境执行一次 `gateway status --json --deep`：
   - 以 `service.loaded` 或 `service.runtime.status == "running"` 判断当前 `2026.5.20` 的官方 Gateway 服务；如果响应还包含 `service.installed`、`service.running`，一并纳入判断；
   - 任一字段表明服务已注册、已加载或正在运行时拒绝前台启动，并提示先停用服务；`runtime.status == "stopped"` 且 `loaded == false` 本身不构成冲突；
   - `extraServices` 非空时同样拒绝启动，不自动清理额外服务；
   - 该检查只属于本次 start preflight，不进入 watcher 轮询。
5. 执行一次 reconcile：
   - 已有同配置受管实例处于 `starting/running` 时直接返回现有快照；
   - 端口被未经验证的进程或 Gateway 占用时返回明确的端口冲突；
   - 已有残留受管 Gateway 时接管并返回 `running`。
6. 使用受管 Node 执行 `openclaw.mjs gateway run`，立即写入 `starting + pid + logPath`。
7. 向前端发送状态事件并快速返回，不等待 Gateway 完全 ready。
8. StatusWatcher 先用 `/healthz` 记录存活，再以 `/readyz` 推进到 `running`。
9. 60 秒内 `/readyz` 未成功时，先调用官方 `gateway stop --json`；仍未退出且 PID 身份未变化时再强制终止，最后转为 `failed`。

跨进程锁只保护“检查并创建”的临界区，不承担运行时所有权。锁文件可以保留，锁的有效性由 Windows 文件句柄决定，应用崩溃后自动释放。

## 停止与退出流程

### 用户点击停止

1. Manager 将状态置为 `stopping`。
2. 使用当前安装的 Node、CLI 入口和相同路径环境执行 `openclaw gateway stop --json`。
3. 官方 CLI 负责验证未托管监听者确实是 Gateway，再发送停止信号。
4. Manager 在限定时间内检查已记录 PID 与 Gateway 端口是否退出。
5. 仍未退出时，只对本次桌面会话创建且身份未变化的 PID 执行强制树终止。
6. 只有进程和端口均已释放才清除 PID，转为 `stopped` 并发送事件。

### 用户点击重启

官方 `gateway restart` 面向系统服务；未托管 Gateway 的原地重启依赖 `SIGUSR1`，不适合作为 Windows 前台模式的可靠契约。因此 Windows app-owned 模式采用明确的应用级重启：

1. 按上述官方 stop 流程停止当前 Gateway。
2. 确认旧 PID 退出且端口释放。
3. 重新执行 `openclaw.mjs gateway run`。
4. 等待新的 `/readyz` 成功。

这不是官方 Service Restart，不使用 `gateway start`，也不与已安装的官方服务并存。

### 窗口关闭

当前主窗口关闭行为是隐藏到系统托盘。窗口隐藏不代表应用退出，因此 OpenClaw 继续运行。

### 应用真正退出

托盘“退出应用”、更新器退出和正常应用退出进入统一退出协调器。退出协调器调用 `RuntimeManager::shutdown`，最多等待固定时间，然后允许桌面进程退出。

如果桌面进程闪退或被强制结束，无法保证执行 shutdown。OpenClaw 可以残留；下次桌面启动时按恢复流程验证并接管。这是故障恢复能力，不是后台常驻产品行为。

## 恢复与单实例规则

实时状态按以下优先级确定：

```text
RuntimeManager snapshot
  -> verified process identity
  -> gateway port owner
  -> gateway HTTP readiness
```

安装注册表中的 `runtimePid/runtimeState/runtimeLogPath` 仅为恢复提示。恢复时必须重新验证：

- PID 当前存在；
- 可执行文件位于受管 Node 目录；
- 命令行包含当前安装的 `package/openclaw.mjs gateway`；
- PID 是配置端口的监听者；
- `/healthz` 可访问；
- `/readyz` 成功后才可恢复为 `running`。

验证全部通过才显示 `running`。端口存在但身份不匹配时显示 `failed` 和“端口被其他进程占用”，不得结束该进程。

## 错误处理

- 所有失败保留面向用户的短消息和完整日志上下文。
- `failed` 状态保留 `lastError`，直到用户再次启动或停止。
- 启动失败不得留下 `starting` 状态。
- 停止失败保留 PID 并显示失败，不得谎报 `stopped`。
- 进程异常退出不自动启动新进程。
- watcher 探测失败只记录探测错误，不立即杀死仍存活的进程。
- 已运行 Gateway 的 `/readyz` 暂时失败不得开放“启动”按钮；只有 PID 退出或端口所有权丢失才进入 `failed`。
- 检测到官方 Scheduled Task 或 Startup-folder Gateway 服务时拒绝创建前台实例，不自动卸载或停止用户已有服务。

## 迁移方案

- 删除 `openclaw-host` daemon 源码和 external-helper 调用路径。
- 保留 `runtimeHostKind` 注册表字段以兼容旧数据，但统一迁移为 `direct-process`。
- 启动时识别旧 `.runtime-host/daemon.pid`；仅在确认 PID 为旧 `openclaw-host` 后停止 daemon，不能停止正在运行的 Gateway。
- 清理旧 `command.json`、`result.json`、`state.json` 和 `daemon.pid`。
- 已经运行的 Gateway 经身份验证后由新的 RuntimeManager 接管。
- 不修改 OpenClaw 配置、插件、渠道和日志目录结构。

## 测试与验收

### 自动化测试

- 状态机覆盖全部合法转换和非法并发操作。
- 连续两次启动只调用一次 process launch。
- `/healthz` 成功但 `/readyz` 失败时保持 `starting`。
- `starting` 状态只在 `/readyz` 成功后进入 `running`。
- 已进入 `running` 后 `/readyz` 暂时失败时保持 `running`，同时输出 `gatewayReady=false`。
- 启动进程提前退出或 60 秒超时进入 `failed`，且不自动重启。
- 端口由不相关进程占用时拒绝启动且不调用 kill。
- 正常停止必须先使用官方 `gateway stop --json`。
- 官方停止超时后的强制终止仅允许作用于本次会话创建且身份未变化的 PID。
- 检测到官方 Gateway 服务时拒绝前台启动。
- 应用 shutdown 只停止受管实例。
- 前端状态映射正确显示启动中、运行中、停止中和失败。
- 源码不再引用 `external-helper`、`spawn-daemon` 或 `.runtime-host/command.json`。

### 手工验收

1. 点击启动，命令快速返回，界面显示“启动中”，随后显示“运行中”。
2. 验证 `/healthz` 可以先于 `/readyz` 成功，界面在此期间仍显示“启动中”。
3. 启动过程中刷新 WebView，不重复启动，状态继续推进。
4. 运行中隐藏窗口到托盘，Gateway 继续监听 `127.0.0.1:18789`。
5. 从托盘退出应用，确认先执行官方 stop，Gateway 在限定时间内停止。
6. 强制结束桌面进程，确认 Gateway 不因前端退出链路被误杀；重开桌面后识别并接管。
7. 强制结束 OpenClaw，界面显示失败且不自动重启。
8. 在 `18789` 启动无关服务，点击启动后显示端口冲突且不结束无关进程。
9. 安装或模拟官方 Gateway 服务后点击启动，确认桌面端报告服务冲突且不创建第二个实例。

## 非目标

- Windows Service。
- 桌面应用正常退出后继续长期运行。
- Windows 启动时自动启动 OpenClaw。
- OpenClaw 崩溃自动重启、退避或熔断。
- 多实例和多端口并行运行。
- Named Pipe、local socket 或文件命令 IPC。
- 改造插件、渠道或 Provider 配置流程。
