# OpenClaw Runtime Host 渐进式改造设计

## 目标

把 OpenClaw runtime 的生命周期所有权从 Tauri 应用命令层抽离出来，形成稳定的 runtime host 控制面，支持：

- OpenClaw 独立运行
- 应用重启后继续检测和访问运行状态
- 后续从当前 direct process 模式平滑迁移到独立 helper

## 主流工程实践判断

对于你这个场景，主流做法不是“桌面应用自己拉一个子进程然后长期托管”，而是把职责拆成两层：

```text
Desktop App / Web UI
  -> control plane
Runtime Host / Agent / Service
  -> lifecycle owner
OpenClaw Runtime
  -> actual workload
```

原因很直接：

- UI 进程天然会刷新、重启、升级，不适合做长期 owner
- runtime 需要独立存活，才能保证任务链路和状态持续
- stop / restart / health / logs / pid 都应该由稳定的 host 统一收口

所以从工程稳健性上，推荐顺序通常是：

1. 先做独立 helper / daemon
2. 再视部署要求升级到系统 service

对于当前项目，`独立 helper/daemon` 是更合适的阶段性架构；直接上 Windows Service 会更重，安装、权限、升级、调试成本都更高。

## 当前问题

当前实现是：

```text
Tauri command
  -> Rust process module
  -> spawn node.exe openclaw.mjs gateway
```

问题不是“不能用”，而是生命周期 owner 放错了层：

- Tauri command 同时承担 UI RPC 和 runtime owner 职责
- registry 只记录 pid，不记录“谁在托管这个 pid”
- 后续如果切到 helper / service，现有调用面需要整体重写

## 本次最小改造

本次不直接引入 `openclaw-host.exe`，先引入统一控制抽象：

```text
Tauri command
  -> runtime_host
     -> direct-process backend   (当前)
     -> external-helper backend  (后续)
     -> windows-service backend  (预留)
```

同时在 installation registry 中记录：

- `runtimeHostKind`

当前默认值：

- `direct-process`

## 为什么先做这一层

这样做的价值是把“运行时托管方式”从上层调用链里解耦出来：

- 前端不需要知道是 pid 直控还是 helper 托管
- Tauri command 只做 command orchestration，不再绑定具体实现
- 卸载、重启、状态恢复都能走同一控制面

这是引入独立 helper 前最小、最稳的演进步骤。

## 当前 helper 阶段

前一轮先引入了最小 helper 可执行程序：

```text
openclaw-host start --config <openclaw.json>
openclaw-host stop --pid <pid>
```

主应用中的 `runtime_host` 当前策略是：

- 优先调用外部 helper
- 如果 helper 不存在，则回退到 `direct-process`

helper 查找顺序：

- 环境变量 `OPENCLAW_RUNTIME_HOST_EXE`
- 主程序同目录下的 `openclaw-host.exe`
- 主程序同目录下的 `openclaw-host`

这一版只能算“把应用和 runtime 启动入口拆开”，还不算真正独立托管。

## 当前实现阶段

本轮把 helper 进一步推进为最小常驻 host：

```text
Tauri UI
  -> openclaw-host start|stop|restart|status --config ...
openclaw-host daemon --config ...
  -> owns node.exe openclaw.mjs gateway
```

host 在每个安装实例目录下维护：

```text
<openclawDir>/.runtime-host/
  state.json
  command.json
  result.json
  daemon.pid
```

这样现在的 owner 已经从 Tauri 进程切换成独立 helper 进程，Tauri 只负责发命令和刷新状态。

这一步的价值是：

- 应用重启后仍可重新连回同一个 runtime owner
- stop / restart 不再必须依赖 UI 持有的 child handle
- runtime host 可以成为后续 health、reload、upgrade 的统一入口

这意味着当前开发期和过渡期都可用，但正式打包仍需要把 helper 作为 sidecar 一起发布。

## 下一阶段建议

下一步建议继续增强 `openclaw-host.exe`：

```text
Tauri UI
  -> local IPC
openclaw-host.exe
  -> node.exe openclaw.mjs gateway
```

host 负责：

- start / stop / restart / reload
- pid ownership
- health / heartbeat
- 日志路径暴露
- 状态快照持久化

本轮已经把 `start / stop / restart / state persistence` 的最小骨架搭起来了。后续建议补：

- `status` 输出更完整的 health 信息
- host 自己做 gateway health probe，而不是完全依赖 app 侧探测
- reload / apply-config-change 子命令
- helper 版本协商与不兼容保护
- 更稳的 IPC 形态，例如 named pipe / local socket

到那个阶段，helper 就会成为真正稳定的 runtime control plane。

## 打包后续

当前 helper 已经存在为独立二进制入口，但后续仍需补：

- Tauri sidecar / bundling 配置
- 安装器把 helper 与主程序放到同目录
- helper 版本与主程序版本对齐校验
- helper status / restart / reload 子命令
