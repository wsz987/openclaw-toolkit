# OpenClaw 飞书兼容离线包更新记录模板

这个文档用于记录一次完整的离线包更新过程。

适用场景：

- 按飞书插件兼容版本刷新 `artifacts/openclaw`
- 升级或替换 `artifacts/node` 中的受管 Node 离线包
- 重写 `artifacts/manifest.json`
- 重写 `artifacts/toolkit-manifest.json`

## 1. 更新目标

填写本次更新的目标版本上限和依据。

示例：

- 飞书插件稳定版上限：`2026.5.20`
- 依据来源：`@larksuite/openclaw-lark` npm `latest`
- 本次保留的 OpenClaw 稳定版：`2026.5.20`、`2026.5.19`、`2026.5.18`、`2026.5.12`

## 2. 版本确认

建议记录：

- 飞书插件 `latest`
- 飞书插件 `beta`
- OpenClaw 目标稳定版列表
- 是否存在登录态或文档时效性问题

可参考命令：

```powershell
npm view @larksuite/openclaw-lark dist-tags --json
npm view @larksuite/openclaw-lark versions --json
npm view openclaw versions --json
```

## 3. OpenClaw 包信息

对每个版本记录：

- `version`
- `engines.node`
- `dist.tarball`
- 本地离线文件名
- 本地 SHA-256

建议格式：

| 版本 | Node 要求 | 本地文件 | SHA-256 |
| --- | --- | --- | --- |
| `2026.5.20` | `>=22.19.0` | `openclaw-2026.5.20.tgz` | `<sha256>` |

## 4. Node 运行时信息

记录：

- 选择的 Node 版本
- 原因：是否满足全部选中 OpenClaw 稳定版
- 本地文件名
- 本地 SHA-256

建议格式：

| Node 版本 | 范围 | 本地文件 | SHA-256 |
| --- | --- | --- | --- |
| `22.19.0` | `>=22.19.0 <23` | `node-v22.19.0-win-x64.zip` | `<sha256>` |

## 5. 落盘目录检查

更新后至少检查：

```powershell
Get-ChildItem artifacts\openclaw | Sort-Object Name | Select-Object Name,Length
Get-ChildItem artifacts\node | Sort-Object Name | Select-Object Name,Length
```

确认点：

- `artifacts/openclaw` 中只保留本次目标版本集合
- `artifacts/node` 中存在正确版本的 Node zip
- 文件大小明显正常，不是下载失败后的空文件或中断文件

## 6. 清单更新检查

### `artifacts/manifest.json`

确认：

- 每个 `release.version` 都对应真实存在的本地 `.tgz`
- `artifact` 文件名正确
- `sha256` 正确
- `requiredNode.version`、`range`、`artifact`、`sha256` 正确

### `artifacts/toolkit-manifest.json`

确认：

- `defaultOpenClawVersion` 为本次最高兼容稳定版
- `supportedOpenClawVersions` 与离线包集合一致

## 7. 代码与测试校验

建议固定执行：

```powershell
pnpm --filter @openclaw-toolkit/desktop typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml version_catalog -- --nocapture
```

如果测试失败是因为旧断言写死了默认版本，则同步断言后重跑。

## 8. 对外汇报模板

可以按下面格式汇报：

```text
本次已按飞书插件稳定版 <version> 刷新离线包。

离线 OpenClaw 版本：
- <version-a>
- <version-b>
- <version-c>
- <version-d>

受管 Node 版本：
- <node-version>

已更新：
- artifacts/openclaw
- artifacts/node
- artifacts/manifest.json
- artifacts/toolkit-manifest.json

验证结果：
- pnpm typecheck 通过
- cargo version_catalog 测试通过

注意事项：
- <如文档登录受限、官方源波动、镜像回退等>
```

## 9. 常见问题

### 1. 飞书文档打不开怎么办

优先用官方 npm 元数据确认稳定版；登录态文档只能作为辅助参考。

### 2. npm 页面和文档写的不一致怎么办

以明确可验证的官方发布元数据为准，并在汇报里说明差异。

### 3. Node 官方下载中断怎么办

可以重试，必要时使用镜像做传输兜底，但最终文件必须和官方 SHA 一致。

### 4. 能不能直接下 GitHub source archive

不建议。离线安装包应优先使用 npm 正式发布的 `.tgz`。
