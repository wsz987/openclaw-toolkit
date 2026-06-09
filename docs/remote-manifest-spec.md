# 远程安装源 Manifest 规范

本文定义 OpenClaw Toolkit 的 `remote` 安装模式所使用的远程制品服务格式。

## 1. 目标

远程模式用于以下场景：

- 管理员在内部配置文件中配置一台远程服务器，默认不向终端用户展示地址
- 工具包从该服务器按版本下载 OpenClaw 和 Node Runtime
- 用户可以选择明确版本，也可以选择 `latest`

## 2. 服务器根地址

远程服务器根地址不在安装向导中展示，而是由内部配置文件管理：

```text
artifacts/toolkit-settings.json
```

示例：

```json
{
  "remoteBaseUrl": "https://intranet.example.com/openclaw"
}
```

如果 `remoteBaseUrl` 为 `null` 或缺失，用户选择 remote 模式时会报错。

工具包会按如下规则拼接下载地址：

- `GET {remoteBaseUrl}/manifest.json`
- `GET {remoteBaseUrl}/artifacts/openclaw/<artifact-file>`
- `GET {remoteBaseUrl}/artifacts/node/<artifact-file>`

## 3. manifest.json 格式

远程 `manifest.json` 使用与本地 `artifacts/manifest.json` 相同的 release 结构。

### 示例

```json
{
  "releases": [
    {
      "name": "openclaw",
      "version": "1.2.1",
      "platform": "win32-x64",
      "artifact": "openclaw-1.2.1-win-x64.tgz",
      "sha256": "<openclaw-sha256>",
      "signature": "<openclaw-signature>",
      "requiredNode": {
        "version": "20.11.1",
        "range": ">=20 <21",
        "artifact": "node-v20.11.1-win-x64.zip",
        "sha256": "<node-sha256>",
        "signature": "<node-signature>"
      },
      "skills": [
        {
          "name": "browser-control",
          "version": "1.0.0"
        }
      ]
    }
  ]
}
```

## 4. 字段说明

### releases

发布列表。每个 release 描述一个可安装版本。

### version

OpenClaw 版本号，建议遵循 semver。

### artifact

OpenClaw 制品文件名，相对路径定位到：

```text
{remoteBaseUrl}/artifacts/openclaw/{artifact}
```

### requiredNode

该 OpenClaw 版本所需的受管 Node Runtime。

- `version`：Node 版本号
- `range`：兼容范围
- `artifact`：Node 制品文件名
- `sha256`：Node 制品校验值
- `signature`：Node 制品签名预留字段

### skills

该字段表示安装器侧附带或建议启用的 skill 清单。

注意：

- 该清单用于安装器部署 `skills/` 资源和生成默认 `agents.defaults.skills`
- 不应再直接写入 OpenClaw 最新版 `openclaw.json` 的根级 `skills: []`
- OpenClaw 最新版配置里，根级 `skills` 是对象配置段，agent 可见技能列表应写入 `agents.defaults.skills` 或 `agents.list[].skills`

## 5. 版本选择规则

用户在界面里填写版本时：

- 填写具体版本：按该版本精确匹配
- 填写 `latest`：由工具包根据远程 manifest 中的 `releases[].version` 计算最新版本

### latest 规则

1. 读取远程 `manifest.json`
2. 解析所有 `releases[].version`
3. 使用 semver 排序
4. 选择最高版本作为安装目标

如果 manifest 为空，则视为配置错误。

## 6. 下载与安装流程

remote 模式推荐流程：

```text
1. 从内部 `toolkit-settings.json` 读取 remoteBaseUrl
2. 拉取 /manifest.json
3. 解析 selectedVersion
4. 解析 release
5. 下载 release.artifact
6. 下载 release.requiredNode.artifact
7. 校验 sha256
8. 解压并安装
```

## 7. 推荐服务器目录结构

```text
openclaw/
├─ manifest.json
├─ artifacts/
│  ├─ openclaw/
│  │  ├─ openclaw-1.2.1-win-x64.tgz
│  │  └─ openclaw-1.2.2-win-x64.tgz
│  └─ node/
│     ├─ node-v20.11.1-win-x64.zip
│     └─ node-v20.12.0-win-x64.zip
```

## 8. 安全要求

远程源至少应满足：

- 只读下载
- 文件级 sha256 校验
- 制品签名预留
- 版本清单和制品分离
- 不依赖公网

## 9. 兼容建议

为了便于维护，建议远程 manifest 与本地 manifest 保持同一 schema。
这样内置稳定版与远程服务器只是在“读取来源”上不同，不需要两套安装逻辑。
