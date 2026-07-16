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
- 将 stdout/stderr 追加到 `gateway-runtime.log`，不使用无人消费的 pipe。
- 查询端口所有者 PID、进程是否存活和进程命令行身份。
- 停止前验证 PID 属于受管 Node 且命令行包含受管 `openclaw.mjs gateway`。
- 先执行有界普通停止，再对同一个已验证 PID 执行强制树终止。

### StatusWatcher

- 调用 `RuntimeManager::reconcile` 推进轻量生命周期状态。
- `starting` 时以 500 ms 频率探测，`running` 时以 2.5 秒探测，`stopped/failed` 时以 10 秒探测。
- 只有状态发生语义变化时更新安装注册表并发送事件。
- 丰富状态读取仍可使用现有插件缓存，但不得阻塞 RuntimeManager 的启动路径。

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
- `starting`：已创建受管 Node，PID 存活，但 Gateway HTTP 尚未 ready。
- `running`：PID 身份有效、端口所有者匹配且 Gateway HTTP ready。
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
}
```

## 启动流程

1. Runtime command 调用 `RuntimeManager::start(configPath)`。
2. Manager 获取进程内 operation lock，并打开安装目录下的跨进程启动锁。
3. 读取轻量 `OpenClawRuntimeContext`，不调用 `plugins list`。
4. 执行一次 reconcile：
   - 已有同配置受管实例处于 `starting/running` 时直接返回现有快照；
   - 端口被未经验证的进程占用时返回明确的端口冲突；
   - 已有残留受管 Gateway 时接管并返回 `running`。
5. 创建 Node 进程，立即写入 `starting + pid + logPath`。
6. 向前端发送状态事件并快速返回，不等待 Gateway 完全 ready。
7. StatusWatcher 以轻量探测推进状态；HTTP ready 后转为 `running`。
8. 60 秒内未 ready 时终止本次创建且身份仍匹配的进程，转为 `failed`。

跨进程锁只保护“检查并创建”的临界区，不承担运行时所有权。锁文件可以保留，锁的有效性由 Windows 文件句柄决定，应用崩溃后自动释放。

## 停止与退出流程

### 用户点击停止

1. Manager 将状态置为 `stopping`。
2. 从当前快照、安装注册表和端口所有者中解析候选 PID。
3. 验证可执行文件、命令行和配置目录属于当前受管实例。
4. 尝试普通树终止并在限定时间内检查退出。
5. 未退出时对相同 PID 执行强制树终止。
6. 清除 PID 和错误，转为 `stopped` 并发送事件。

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
- Gateway HTTP 可访问。

验证全部通过才显示 `running`。端口存在但身份不匹配时显示 `failed` 和“端口被其他进程占用”，不得结束该进程。

## 错误处理

- 所有失败保留面向用户的短消息和完整日志上下文。
- `failed` 状态保留 `lastError`，直到用户再次启动或停止。
- 启动失败不得留下 `starting` 状态。
- 停止失败保留 PID 并显示失败，不得谎报 `stopped`。
- 进程异常退出不自动启动新进程。
- watcher 探测失败只记录探测错误，不立即杀死仍存活的进程。

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
- `starting` 状态在 HTTP ready 后进入 `running`。
- 启动进程提前退出或 60 秒超时进入 `failed`，且不自动重启。
- 端口由不相关进程占用时拒绝启动且不调用 kill。
- 停止前必须通过进程身份验证。
- 应用 shutdown 只停止受管实例。
- 前端状态映射正确显示启动中、运行中、停止中和失败。
- 源码不再引用 `external-helper`、`spawn-daemon` 或 `.runtime-host/command.json`。

### 手工验收

1. 点击启动，命令快速返回，界面显示“启动中”，随后显示“运行中”。
2. 启动过程中刷新 WebView，不重复启动，状态继续推进。
3. 运行中隐藏窗口到托盘，Gateway 继续监听 `127.0.0.1:18789`。
4. 从托盘退出应用，Gateway 在限定时间内停止。
5. 强制结束桌面进程，确认 Gateway 不因前端退出链路被误杀；重开桌面后识别并接管。
6. 强制结束 OpenClaw，界面显示失败且不自动重启。
7. 在 `18789` 启动无关服务，点击启动后显示端口冲突且不结束无关进程。

## 非目标

- Windows Service。
- 桌面应用正常退出后继续长期运行。
- Windows 启动时自动启动 OpenClaw。
- OpenClaw 崩溃自动重启、退避或熔断。
- 多实例和多端口并行运行。
- Named Pipe、local socket 或文件命令 IPC。
- 改造插件、渠道或 Provider 配置流程。
