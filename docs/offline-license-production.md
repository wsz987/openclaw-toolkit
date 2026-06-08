# OpenClaw 离线授权生产使用文档

## 当前链路

OpenClaw 使用“短激活码 + 签名授权文件”的离线授权方案。

- 客户输入的激活码是短格式，例如 `8F3K-29HD-Q7M2`。
- 授权文件是 `license.dat`，随离线安装包一起交付或放在安装资源目录。
- 授权签发端持有 Ed25519 私钥。
- 桌面客户端只内置 Ed25519 公钥。
- 客户端在安装 OpenClaw 前，由 Rust Core 在本机离线验签。

生产客户端内置公钥路径：

```text
apps/desktop/src-tauri/keys/openclaw-license-public.der
```

客户端默认读取授权文件：

```text
artifacts/license.dat
```

私钥不能提交到仓库，也不能打包进桌面客户端。PEM/DER 公私钥都不是客户输入。

## 使用方式

首次初始化内部签发材料：

```bash
pnpm license:init-signing-keys -- --install-public-key
```

日常给客户签发授权：

```bash
pnpm license:issue-key -- \
  --customer "Acme Corp" \
  --tier stage-1 \
  --expires-in 1y
```

把签发目录里的两个文件交付给客户：

```text
activation-code.txt   客户输入的短激活码，例如 8F3K-29HD-Q7M2
license.dat           放进离线安装包的 artifacts/license.dat
```

客户安装时只需要做两件事：

1. 确认离线安装包内存在 `artifacts/license.dat`。
2. 在安装器“离线激活码”输入框填入 `activation-code.txt` 里的短码。

开发调试可以直接把授权文件写入当前资源目录：

```bash
pnpm license:issue-key -- \
  --tier stage-1 \
  --expires-in 1y \
  --install-license-file
```

## 授权内容结构

`license.dat` 内部包含 base64url payload 和 Ed25519 signature。payload 是签名保护的 JSON：

```json
{
  "licenseId": "lic-...",
  "customer": "Acme Corp",
  "tier": "stage-1",
  "expiresAt": "2027-12-31",
  "features": [
    "offline-install",
    "remote-artifact-install",
    "official-npm-install",
    "managed-node-runtime",
    "local-skills",
    "browser-control"
  ],
  "activationHash": "sha256:...",
  "iat": 1780000000,
  "exp": 1800000000
}
```

`activationHash` 绑定客户输入的短激活码。客户端会先验 `license.dat` 签名，再比较短码哈希，避免用户随便填一个 UUID 也能通过。

当前 OpenClaw 安装流程会使用这些功能开关：

- `managed-node-runtime`：Stage 1 安装主流程必须包含。
- `offline-install`：安装模式为 `local` 时必须包含。
- `remote-artifact-install`：安装模式为 `remote` 时必须包含。
- `official-npm-install`：安装模式为 `npm` 时必须包含。

安装完成后的插件安装不再校验授权。离线授权只在 OpenClaw 主安装流程中校验。

## 内部签发 CLI

初始化签名密钥对：

```bash
pnpm license:init-signing-keys -- --install-public-key
```

兼容旧命令：

```bash
pnpm license:generate-keys -- --install-public-key
```

这会生成：

```text
license-keys/openclaw-license-private.pem
license-keys/openclaw-license-public.der
```

`license-keys/` 已加入 git 忽略。`--install-public-key` 会把 DER 公钥复制到 Tauri 客户端内置公钥路径。

这里有三个不同概念，不能混用：

- 签名私钥：`openclaw-license-private.pem`。只放在签发端。
- 客户激活码：例如 `8F3K-29HD-Q7M2`。这是客户在安装器里输入的短码。
- 授权文件：`license.dat`。这是签名后的授权内容，随离线包交付。

`licenseId` 仍然是 `lic-<uuid>`，用于后台记录、重签、撤销和审计。它不是客户激活码。单独 UUID 无法离线防伪，客户端必须验证签名后的授权文件。

签发 Stage 1 授权：

```bash
pnpm license:issue-key -- \
  --tier stage-1 \
  --expires-in 1y
```

命令默认会创建：

```text
license-keys/issued/lic-.../activation-code.txt
license-keys/issued/lic-.../license.dat
```

输出示例：

```text
Activation code: 8F3K-29HD-Q7M2
License bundle: license-keys/issued/lic-...
8F3K-29HD-Q7M2
```

开发调试时可以把 `license.dat` 直接安装到当前资源目录：

```bash
pnpm license:issue-key -- \
  --tier stage-1 \
  --expires-in 1y \
  --install-license-file
```

常用参数：

- `--customer`：可选客户名称，会写入 license payload。
- `--tier`：授权等级。当前支持 `stage-1` 和 `stage-2`。
- `--expires-in`：授权有效期，从签发当天按日历日期计算。支持 `30d`、`2w`、`1m`、`1y`，也支持 ISO-8601 duration。
- `--expires-at`：绝对过期日期，格式为 `YYYY-MM-DD`。`--expires-at` 和 `--expires-in` 二选一。
- `--activation-code`：指定短码，适合重签或客服补发。
- `--code-length`：短码字符数，默认 12。12 位 Crockford Base32 大约 60 bit 随机量。
- `--out-dir`：指定客户授权包输出目录。
- `--output`：额外写出短激活码文本。
- `--license-file`：额外写出 `license.dat` 到指定路径。
- `--install-license-file`：复制 `license.dat` 到 `artifacts/license.dat`。

签发 Stage 2 授权：

```bash
pnpm license:issue-key -- \
  --tier stage-2 \
  --expires-in 1y
```

## 使用次数

当前离线授权包可以无限次使用。

客户端只检查：

- `license.dat` 签名是否正确；
- 短激活码是否匹配 `license.dat`；
- 是否过期；
- 是否包含安装所需 features。

客户端目前不校验机器指纹，不记录激活次数，也不会联网扣次数。所以同一个未过期的授权包可以重复安装，也可以复制到另一台机器上使用。

如果后续要限制使用次数，可以选择：

- 绑定机器的离线授权：把机器指纹写进 payload 并签名。这样可以限制只能在某台机器使用，但同一台机器重复安装仍然可以。
- 在线激活：连接授权服务器校验并记录激活次数。要实现真正的“只能用 N 次”，必须使用在线授权。

## 后续生产签发后台规划

当前 CLI 是第一版可用签发方式。后续可以保留相同 payload 和签名规则，再扩展成后台服务：

- 操作员登录鉴权。
- 保存 license 记录，包括 `licenseId`、短激活码哈希、客户、等级、features、过期时间、签发人和签发时间。
- 私钥从 KMS/HSM 或安全密钥管理系统加载。
- 记录签发、撤销、重新签发的审计日志。
- 支持公钥 id，即 `kid`，用于密钥轮换。
- 在线环境可以增加撤销列表。纯离线安装只能在更新或支持流程中接收撤销信息。

后台可以提供这些管理 API：

```text
POST /licenses
GET /licenses/:licenseId
POST /licenses/:licenseId/reissue
POST /licenses/:licenseId/revoke
```

桌面客户端仍然保持离线优先：只需要内置公钥、短激活码和已签名的 `license.dat`。
