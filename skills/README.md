# 项目内 Skills

这个目录用于存放仓库内可复用的维护流程 skill。

这些 skill 主要用来沉淀项目特有、容易重复执行、又不适合每次临时口述的操作流程，避免后续维护时出现版本选择不一致、目录写错、清单漏改、校验遗漏等问题。

## 当前可用 Skill

### `openclaw-feishu-offline-sync`

路径：

- [openclaw-feishu-offline-sync/SKILL.md](./openclaw-feishu-offline-sync/SKILL.md)

适用场景：

- 按飞书插件兼容版本限制 OpenClaw 版本上限
- 更新 `artifacts/openclaw` 离线包
- 更新 `artifacts/node` 受管 Node 离线运行时
- 同步 `artifacts/manifest.json`
- 同步 `artifacts/toolkit-manifest.json`
- 维护本地离线安装模式下的版本列表

常见触发说法：

- “按飞书插件兼容版本更新离线包”
- “同步 OpenClaw 离线包到飞书插件最新稳定版”
- “更新 `artifacts/openclaw`”
- “把本地离线版本上限锁到某个飞书插件兼容版本”

## 目录约定

新增项目内 skill 时，建议遵循下面的约定：

1. 在 `skills/` 下创建独立目录。
2. 每个 skill 的主说明文件统一命名为 `SKILL.md`。
3. `description` 要明确写清楚“什么时候该触发这个 skill”。
4. 尽量写清本仓库专属的目录、命令、校验方式和约束规则。
5. 如果流程依赖外部版本源或官方发布信息，要写明“以谁为准”的优先级。

## 这个目录的目标

这个目录的目标不是泛化能力展示，而是把项目里的重复维护动作标准化，尤其适合沉淀下面这些类型的流程：

- 离线包维护
- 兼容版本管理
- 安装清单同步
- 打包前校验
- 项目内固定操作流程
