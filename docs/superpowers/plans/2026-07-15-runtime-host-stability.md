# Runtime Host Stability 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 消除 host 冷启动时的错误超时，并避免状态轮询重复执行 OpenClaw 插件 CLI。

**架构：** 将 gateway 启动所需的路径和端口提取为轻量运行时上下文，供 host 在 ready 前使用。完整 GUI 状态继续包含插件信息，但插件发现按配置文件修改时间和 60 秒 TTL 缓存。host 的命令检查维持响应性，运行时状态探测改为低频且仅使用 PID 和本地端口。

**技术栈：** Rust 2021、Tauri 2、serde、标准库 `Mutex`/`OnceLock`、Cargo test。

---

## 文件结构

- 修改：`apps/desktop/src-tauri/src/core/openclaw_config/mod.rs` - 运行时上下文、插件发现缓存、完整状态读取复用。
- 修改：`apps/desktop/src-tauri/src/core/process/mod.rs` - 以轻量上下文启动 gateway 的独立入口。
- 修改：`apps/desktop/src-tauri/src/bin/openclaw-host.rs` - host ready 与低频运行时探测。
- 修改：`docs/superpowers/plans/2026-07-15-runtime-host-stability.md` - 勾选实际完成的步骤。

### 任务 1：轻量运行时上下文

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/openclaw_config/mod.rs:31-63,494-612,2375-2526`
- 修改：`apps/desktop/src-tauri/src/core/process/mod.rs:60-110`

- [ ] **步骤 1：编写失败的上下文构造测试**

在 `openclaw_config` 的测试模块中添加一个临时 OpenClaw 目录、`openclaw.json` 和 `installed-manifest.json`，然后断言新 API 返回正确的路径和 gateway URL：

```rust
#[test]
fn runtime_context_reads_launch_paths_without_plugin_discovery() {
    let context = read_openclaw_runtime_context(&config_path).unwrap();
    assert_eq!(context.gateway_url, "http://127.0.0.1:18789");
    assert_eq!(context.node_dir, node_dir.to_string_lossy());
    assert_eq!(context.runtime_log_path, openclaw_dir.join("logs/gateway-runtime.log").to_string_lossy());
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test -p openclaw-toolkit-desktop runtime_context_reads_launch_paths_without_plugin_discovery`

预期：FAIL，提示 `read_openclaw_runtime_context` 未定义。

- [ ] **步骤 3：实现轻量上下文与启动入口**

在 `openclaw_config/mod.rs` 定义：

```rust
#[derive(Debug, Clone)]
pub struct OpenClawRuntimeContext {
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    pub gateway_url: String,
    pub runtime_log_path: String,
}

pub fn read_openclaw_runtime_context(config_path: &Path) -> anyhow::Result<OpenClawRuntimeContext> {
    // 只解析 config 和 installed-manifest，不调用 OpenClaw CLI。
}
```

在 `process/mod.rs` 添加 `launch_managed_openclaw_from_context(&OpenClawRuntimeContext)`，复用现有 node、entry、日志和环境变量逻辑；原有基于 `OpenClawStatusSummary` 的函数将状态转换为同样的启动字段后调用该入口。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test -p openclaw-toolkit-desktop runtime_context_reads_launch_paths_without_plugin_discovery`

预期：PASS。

- [ ] **步骤 5：提交任务**

```bash
git add apps/desktop/src-tauri/src/core/openclaw_config/mod.rs apps/desktop/src-tauri/src/core/process/mod.rs
git commit -m "feat: add lightweight runtime context"
```

### 任务 2：缓存 GUI 插件发现

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/openclaw_config/mod.rs:1364-1374,2375-2526`

- [ ] **步骤 1：编写失败的缓存测试**

在测试模块添加可注入发现闭包的缓存测试，断言相同配置修改时间在 TTL 内仅调用一次：

```rust
#[test]
fn plugin_discovery_cache_reuses_value_before_ttl_expires() {
    let mut calls = 0;
    let mut cache = PluginDiscoveryCache::default();
    let first = cache.get_or_discover(&config_path, modified_at, now, || { calls += 1; sample_discovery() });
    let second = cache.get_or_discover(&config_path, modified_at, now + Duration::from_secs(59), || { calls += 1; sample_discovery() });
    assert_eq!(calls, 1);
    assert_eq!(first, second);
}
```

再添加一项测试，使用更晚的配置修改时间断言闭包被第二次调用。

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test -p openclaw-toolkit-desktop plugin_discovery_cache_`

预期：FAIL，提示 `PluginDiscoveryCache` 未定义。

- [ ] **步骤 3：实现 60 秒缓存并接入完整状态读取**

实现 `PluginDiscoveryCache`，缓存键为规范化配置路径，条目保存配置修改时间、发现时间和 `OpenClawPluginDiscovery`。只有配置 mtime 相同且距发现不足 60 秒时返回缓存；否则执行原有 `read_openclaw_discovered_plugins` 并更新缓存。使用 `OnceLock<Mutex<PluginDiscoveryCache>>` 作为 GUI/库进程内共享缓存，并继续在 CLI 错误时使用现有 manifest/config 回退。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test -p openclaw-toolkit-desktop plugin_discovery_cache_`

预期：PASS。

- [ ] **步骤 5：提交任务**

```bash
git add apps/desktop/src-tauri/src/core/openclaw_config/mod.rs
git commit -m "perf: cache plugin discovery"
```

### 任务 3：轻量 host ready 与低频协调

**文件：**
- 修改：`apps/desktop/src-tauri/src/bin/openclaw-host.rs:20-24,233-250,330-403,424-466,621-640`

- [ ] **步骤 1：编写失败的调度测试**

在 `openclaw-host.rs` 的测试模块中添加纯函数测试：

```rust
#[test]
fn runtime_reconciliation_is_due_every_five_seconds() {
    assert!(runtime_reconciliation_due(None, now));
    assert!(!runtime_reconciliation_due(Some(now), now + Duration::from_secs(4)));
    assert!(runtime_reconciliation_due(Some(now), now + Duration::from_secs(5)));
}
```

并增加常量断言：`SPAWN_READY_TIMEOUT_MS == 30_000`。

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test -p openclaw-toolkit-desktop --bin openclaw-host runtime_reconciliation_is_due_every_five_seconds`

预期：FAIL，提示函数不存在且 timeout 仍是 `4_000`。

- [ ] **步骤 3：实现 host 的轻量路径**

将 `run_daemon` 改为调用 `read_openclaw_runtime_context`，在持久化 `DaemonState` 前完成轻量上下文读取；`ensure_runtime_started` 改用 `launch_managed_openclaw_from_context`。将 ready timeout 设为 30 秒。保留 800 ms 命令文件轮询，但以 `runtime_reconciliation_due` 限制 `reconcile_runtime_state` 至最多每五秒；协调逻辑仅检查 PID 与 `probe_gateway_runtime`，不得调用完整状态读取或插件发现。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test -p openclaw-toolkit-desktop --bin openclaw-host runtime_reconciliation_is_due_every_five_seconds`

预期：PASS。

- [ ] **步骤 5：运行全量桌面 Rust 测试**

运行：`cargo test -p openclaw-toolkit-desktop`

预期：PASS。

- [ ] **步骤 6：提交任务**

```bash
git add apps/desktop/src-tauri/src/bin/openclaw-host.rs docs/superpowers/plans/2026-07-15-runtime-host-stability.md
git commit -m "fix: stabilize runtime host startup"
```
