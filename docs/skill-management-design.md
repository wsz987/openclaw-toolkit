# OpenClaw 内置 Skill 管理设计

## 当前结论

当前项目原先的 skill 链路只是基础占位：安装流程会创建
`<openclawDir>/skills/installed-skills.json`，并把 release manifest 里的
`skills` 写入 `agents.defaults.skills`。它没有真正把内置 skill 目录复制到
OpenClaw 可扫描位置，也没有启用/关闭 UI。

本设计把内置 skill 资源纳入 `artifacts`，并使用配置式 catalog 管理：

```text
artifacts/
  skills.json
  skills/
    <skill-name>/
      SKILL.md
      scripts/
      references/
      assets/
```

仓库根 `skills/` 仍用于本项目维护流程，不作为最终用户 OpenClaw skill 资源。

## OpenClaw 规范对齐

OpenClaw 2026.5.20 的 skill 规则：

- 每个 skill 是一个包含 `SKILL.md` 的目录。
- `skills.load.extraDirs` 是额外扫描根目录，每个根目录下放多个 skill 子目录。
- `agents.defaults.skills` 是默认 agent 的可见 skill allowlist。
- 省略 `agents.defaults.skills` 表示默认不限制；写 `[]` 表示暴露无 skill。
- `skills.entries.<skillKey>.enabled = false` 可以禁用指定 skill。
- 变更 skill 配置后，新 session 或 watcher 刷新后生效；工具包侧标记为需要重启更稳妥。

因此工具包启用一个内置 skill 时会同时保证：

- 资源存在于 `<openclawDir>/skills/<skill-name>/SKILL.md`
- `<openclawDir>/skills` 在 `skills.load.extraDirs`
- `skills.entries.<skill-name>.enabled = true`
- `agents.defaults.skills` 包含该 skill

关闭时：

- 保留文件，便于快速重新启用
- `skills.entries.<skill-name>.enabled = false`
- 从 `agents.defaults.skills` 移除该 skill

## 数据结构

`artifacts/skills.json`：

```json
{
  "skills": [
    {
      "id": "browser-control",
      "name": "browser-control",
      "version": "1.0.0",
      "title": "Browser Control",
      "description": "Use OpenClaw browser-control workflows.",
      "category": "core",
      "sourceDir": "artifacts/skills/browser-control",
      "bundled": false,
      "installByDefault": true,
      "enabledByDefault": true,
      "aliases": ["browser"],
      "tags": ["browser", "automation"]
    }
  ]
}
```

字段约定：

- `id`：工具包内部管理 ID，UI 和命令参数优先使用它。
- `name`：OpenClaw skill 名称，应与 `SKILL.md` frontmatter `name` 一致。
- `sourceDir`：相对项目资源根的目录，必须在资源根内。
- `installByDefault`：安装阶段复制到 OpenClaw 实例。
- `enabledByDefault`：安装生成配置时默认加入 allowlist。
- `bundled`：表示 OpenClaw 自身已捆绑该 skill；没有 `sourceDir` 时只改配置，不复制资源。

## 模块边界

后端公共逻辑集中在 `apps/desktop/src-tauri/src/core/skills/mod.rs`：

- 读取 `artifacts/skills.json`
- 安装内置 skill 目录
- 查询安装与启用状态
- 切换启用状态并写 `openclaw.json`

安装流程和 post-install UI 都调用该模块，不在前端散落配置规则。

前端入口：

- `inspect_openclaw_skill_catalog`
- `set_openclaw_skill_enabled`
- `SkillsManagementPanel`

## 后续新增 skill 流程

1. 在 `artifacts/skills/<skill-name>/` 新增 `SKILL.md`。
2. 在 `artifacts/skills.json` 新增一条 catalog 记录。
3. 如果希望安装后默认启用，在 release manifest 的 `skills` 中加入同名项，或设置 catalog 的
   `installByDefault/enabledByDefault`。
4. 运行前端 typecheck 与 Rust 编译检查。

## 不做的事

- 不把用户内置 skill 放进仓库根 `skills/`，避免和项目维护 skill 混淆。
- 不直接调用 `openclaw skills install` 安装内置资源；离线场景下复制受管资源更可控。
- 不删除关闭的 skill 文件；关闭只改变可见性和 enabled 配置。
