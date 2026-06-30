# Desktop Update Mechanism

## Architecture

The desktop app uses the official Tauri v2 updater plugin. The app does not implement its own downloader or installer.

The server lives in `apps/server`:

- Next route handlers for update checks, admin actions, and artifact downloads.
- Drizzle with SQLite for release metadata and service settings.
- Local artifact storage under `apps/server/storage/releases`.
- Tailwind + small shadcn-style UI primitives for the admin pages.

Primary endpoint:

```text
https://openclaw.wsz987.xyz/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}
```

Fallback endpoint:

```text
http://47.80.6.78/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}
```

HTTP fallback is enabled through `dangerousInsecureTransportProtocol`. Prefer putting TLS in front of `47.80.6.78` before public release.

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
  -e PUBLIC_SERVER_BASE_URL=https://openclaw.wsz987.xyz `
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

License management lives at:

```text
http://127.0.0.1:31421/admin/licenses
```

It supports company grouping, online activation code issuance, status management, optional activation limits, optional expiration dates, and optional offline `license.dat` fallback generation. Empty expiration dates are stored as `null` and mean no expiration limit.

## License Validation Contract

Applications validate online activation codes with:

```http
POST /api/v1/licenses/validate
Content-Type: application/json

{
  "activationCode": "8F3K-29HD-Q7M2",
  "machineId": "optional-stable-device-id",
  "appVersion": "0.1.2"
}
```

All new license APIs use a normalized envelope:

```json
{
  "success": true,
  "code": "OK",
  "message": "激活成功",
  "data": {
    "license": {
      "licenseId": "lic-...",
      "companyName": "Example Co",
      "tier": "stage-1",
      "features": ["offline-install", "managed-node-runtime"],
      "expiresAt": null,
      "status": "active",
      "maxActivations": null,
      "activationCount": 1
    }
  }
}
```

Validation failures return the same envelope with `success: false`. The app should display the `message` field directly, for example `激活码不存在，请检查后重试`, `激活码已过期`, or `激活数量已达上限`.

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
  "url": "https://openclaw.wsz987.xyz/api/v1/desktop/downloads/0.1.1/windows-x86_64/openclaw.zip",
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

`companies` stores customer groups by company name.

`license_keys` stores online activation keys:

- `companyId`
- `activationCodeHash`
- `activationCodePreview`
- `licenseId`
- `tier`
- `featuresJson`
- `expiresAt`
- `status`
- `expiresAt` (`null` means no expiration limit)
- `maxActivations` (`null` means unlimited)
- `activationCount`
- `offlineLicenseJson`

`license_activation_events` stores validation attempts with hashed machine identifiers and app versions.

The update selector only returns releases that are enabled, newer than the current version, on the requested channel, and have an enabled matching asset.

## Signing And Publishing

The desktop installer is not Windows Authenticode code-signed. Tauri updater package signing is separate from Windows code signing and is required by the official updater plugin.

The Tauri updater public key is committed in `apps/desktop/src-tauri/tauri.conf.json`. The private key is generated locally under `apps/desktop/.tmp/` and ignored by git.

Build signing uses:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="D:\coding\auto-intsall-openclaw\apps\desktop\.tmp\openclaw-updater.key"
pnpm --dir apps/desktop build
```

After build, upload the generated updater artifact and `.sig` file in the admin page, then enable the release. The server also stores `sha256` for the uploaded artifact for audit/manual verification.

## Desktop Behavior

The installed desktop app checks updates:

- automatically after entering the installed home screen;
- periodically every 6 hours while the app is open;
- manually from sidebar Settings -> Check Update.

On Windows the updater is configured with `installMode: "passive"`, so after the user clicks install, the NSIS updater runs without showing the normal installer option flow.

## Production Notes

- Put HTTPS in front of the fallback host.
- Add authentication before exposing `/admin/updates` or `/admin/licenses` publicly. The JSON admin API supports `SERVER_ADMIN_TOKEN`; the form pages are intended for internal deployment until auth is added.
- Do not lose the updater private key; existing clients cannot install future signed updates without it.
