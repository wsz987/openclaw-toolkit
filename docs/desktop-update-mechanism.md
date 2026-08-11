# Desktop Update Mechanism

## Architecture

The desktop app uses the official Tauri v2 updater plugin. The app does not implement its own downloader or installer.

The server lives in `apps/server`:

- Next route handlers for update checks, admin actions, and artifact downloads.
- Drizzle with SQLite for release metadata and service settings.
- Local artifact storage under `apps/server/storage/releases`.
- Tailwind + small shadcn-style UI primitives for the admin pages.

Primary endpoint (configurable via `PUBLIC_SERVER_BASE_URL` / `OPENCLAW_REMOTE_SERVICE_BASE_URL`):

```text
https://YOUR-UPDATE-SERVER.invalid/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}
```

> `.invalid` 是保留 TLD，永不解析。开源仓库中仅作为占位地址，请替换为你自己的更新服务器地址，或通过环境变量配置。
> 桌面端 Rust 侧从 `OPENCLAW_REMOTE_SERVICE_BASE_URL` / `OPENCLAW_REMOTE_SERVICE_FALLBACK_BASE_URL` 读取基地址，默认回退到占位地址。

## SQLite

Default database path:

```text
apps/server/data/server.sqlite
```

Docker database path:

```text
/data/server.sqlite
```

Initialize or update schema:

```powershell
pnpm --dir apps/server db:push
```

Ignored runtime paths:

- `apps/server/data/`
- `apps/server/storage/`
- `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal`

## Docker

Build from the repository root:

```powershell
docker build -f apps/server/Dockerfile -t openclaw-server:local .
```

Run with a named volume for SQLite and uploaded updater artifacts:

```powershell
docker run -d --name openclaw-server `
  -p 31421:31421 `
  -e PUBLIC_SERVER_BASE_URL=https://YOUR-UPDATE-SERVER.invalid `
  -e SERVER_ADMIN_TOKEN=replace-with-a-long-random-token `
  -e SQLITE_DB_PATH=/data/server.sqlite `
  -e RELEASE_STORAGE_DIR=/data/releases `
  -v openclaw-server-data:/data `
  openclaw-server:local
```

Or use:

```powershell
$env:SERVER_ADMIN_TOKEN="replace-with-a-long-random-token"
docker compose -f apps/server/docker-compose.yml up -d --build
```

The container runs migrations on startup. Keep `/data` mounted; it contains both the SQLite database and uploaded update artifacts.

## Admin Page

Open:

```text
http://127.0.0.1:31421/admin/updates
```

The page supports:

- setting the public base URL used to generate artifact download URLs;
- uploading a Tauri updater artifact;
- uploading a Tauri updater `.sig` file or pasting the updater signature text;
- creating a version record;
- enabling or disabling releases;
- listing recent releases and platform assets.

## Update Check Contract

Desktop request:

```http
GET /api/v1/desktop/updates/windows/x86_64/0.1.0?channel=stable
```

When an update is available, the server returns `200`:

```json
{
  "version": "0.1.1",
  "notes": "Fixes and improvements",
  "pub_date": "2026-06-30T00:00:00.000Z",
  "url": "https://YOUR-UPDATE-SERVER.invalid/api/v1/desktop/downloads/0.1.1/windows-x86_64/openclaw.zip",
  "signature": "TAURI_UPDATER_SIGNATURE"
}
```

When no update is available, the server returns `204 No Content`.

## Tables

`desktop_releases` stores version-level configuration:

- `version`
- `channel`
- `enabled`
- `notes`
- `pubDate`

`desktop_release_assets` stores platform-specific artifacts:

- `target`
- `arch`
- `url`
- `signature`
- `sha256`
- `enabled`

`update_server_settings` stores simple server configuration:

- `publicBaseUrl`


The update selector only returns releases that are enabled, newer than the current version, on the requested channel, and have an enabled matching asset.

## Signing And Publishing

The desktop installer is not Windows Authenticode code-signed. Tauri updater package signing is separate from Windows code signing and is required by the official updater plugin.

The Tauri updater public key is committed in `apps/desktop/src-tauri/tauri.conf.json`. The private key is stored locally under `apps/desktop/signing/` and ignored by git.

Build signing uses:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="<你的仓库路径>\apps\desktop\signing\openclaw-updater.key"
pnpm --dir apps/desktop build
```

After build, upload the generated updater artifact and `.sig` file in the admin page, then enable the release. The server also stores `sha256` for the uploaded artifact for audit/manual verification.

## 生成你自己的签名密钥（推荐）

> **私钥必须保密，严禁提交到仓库。** 任何人都能用私钥签发"通过公钥校验"的更新包——配合桌面端静默自动更新，等于可向所有用户推送恶意版本（供应链攻击）。

仓库内提交的 `apps/desktop/signing/openclaw-updater.key.pub` 和 `tauri.conf.json` 的 `plugins.updater.pubkey` 是**作者部署**的公钥。**每位部署者都应生成自己独立的密钥对**，不要复用或公开他人的私钥。

生成新的密钥对：

```powershell
cd apps/desktop
pnpm exec tauri signer generate --ci `
  --password "<你的私钥密码，请妥善保存>" `
  -w "apps\desktop\signing\openclaw-updater.key" `
  -f
```

生成后：

1. **保存好私钥**（`apps/desktop/signing/openclaw-updater.key`）和密码——丢失后将无法再签发更新包，已发布版本也无法再更新；
2. 把新公钥写进 `apps/desktop/src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`（内容即 `signing/openclaw-updater.key.pub`，为 minisign 公钥 base64）；
3. 发布构建时通过环境变量提供私钥：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="<你的仓库路径>\apps\desktop\signing\openclaw-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<你的私钥密码>"
pnpm --dir apps/desktop build
```

**`.gitignore` 已覆盖 `apps/desktop/signing/*.key`**，私钥文件不会被 git 跟踪或提交；若误 `git add`，会先被忽略并在 `git status` 中不显示。

## Desktop Behavior

The installed desktop app checks updates:

- automatically after entering the installed home screen;
- periodically every 6 hours while the app is open;
- manually from sidebar Settings -> Check Update.

On Windows the updater is configured with `installMode: "passive"`, so after the user clicks install, the NSIS updater runs without showing the normal installer option flow.

## Production Notes

- Put HTTPS in front of the fallback host.
- Add authentication before exposing `/admin/updates` publicly. The JSON admin API supports `SERVER_ADMIN_TOKEN`; the form pages are intended for internal deployment until auth is added.
- Do not lose the updater private key; existing clients cannot install future signed updates without it.
