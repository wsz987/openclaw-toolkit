---
name: openclaw-feishu-offline-sync
description: Maintain this project's OpenClaw offline package set based on the latest compatible Feishu plugin release. Use this skill whenever the user mentions Feishu plugin compatibility, 飞书插件版本, updating offline OpenClaw packages, refreshing artifacts/openclaw, syncing artifacts/manifest.json, or wants to cap supported OpenClaw versions to a Feishu-supported release line.
---

# OpenClaw Feishu Offline Sync

Use this skill to update the repository's offline OpenClaw package set so it stays aligned with the latest Feishu plugin compatible version.

This skill is for this repository's packaging workflow, not for general product recommendations.

If you need a human-readable Chinese execution record or report structure, read `references/example-update.md`.

## What this skill maintains

The skill updates these repository locations:

- `artifacts/openclaw/`
- `artifacts/node/`
- `artifacts/manifest.json`
- `artifacts/toolkit-manifest.json`

It may also require updating version-catalog tests if the default offline version changes.

## Expected outcome

After running this workflow:

- local offline mode only exposes the approved stable OpenClaw versions
- the default version is the newest approved compatible version
- the required managed Node runtime exists in `artifacts/node`
- `artifacts/manifest.json` points to real local files with correct hashes
- `artifacts/toolkit-manifest.json` caps supported versions to the approved set

## Core rules

Always follow these rules:

1. Treat the Feishu plugin compatible stable version as the upper bound for OpenClaw in this repo.
2. Prefer official npm metadata over scraping package pages.
3. Never include prerelease OpenClaw versions such as `alpha`, `beta`, `rc`, `next`, or `canary`.
4. Store official npm-published OpenClaw `.tgz` files as offline packages, not GitHub source archives.
5. Resolve the required Node version from the selected OpenClaw versions' `engines.node`.
6. If the new OpenClaw line requires a higher Node version, replace the offline Node artifact and update manifest entries accordingly.
7. Keep the offline version window small: normally the newest compatible stable version plus the previous 2-3 stable versions.

## Source-of-truth lookup order

When the user gives a Feishu compatibility version:

1. If the user gives a concrete compatible version, use it as the upper bound.
2. If the user says to use the latest Feishu plugin compatible release, verify it from official npm metadata first.
3. If a Feishu doc link is provided, try to verify it, but treat login-gated or stale pages as secondary evidence.

Use npm metadata like:

- `npm view @larksuite/openclaw-lark dist-tags --json`
- `npm view @larksuite/openclaw-lark versions --json`
- `npm view openclaw versions --json`
- `npm view openclaw@<version> dist.tarball dist.shasum engines --json`

## Version selection algorithm

1. Determine the approved upper-bound OpenClaw version.
2. Query official `openclaw` npm versions.
3. Remove any prerelease versions:
   - containing `alpha`
   - containing `beta`
   - containing `rc`
   - containing `next`
   - containing `canary`
4. Keep the approved version and the previous 2-3 stable versions.
5. Prefer recent versions from the same compatibility line unless the user asks for a larger range.

Example:

- compatible upper bound: `2026.5.20`
- chosen offline set: `2026.5.20`, `2026.5.19`, `2026.5.18`, `2026.5.12`

## Node runtime selection algorithm

1. Read `engines.node` for each chosen OpenClaw version.
2. Pick a managed Node version that satisfies all chosen versions.
3. Download the Windows x64 zip for that Node version.
4. Record its SHA-256 in the manifest.

For this repository, the managed Node artifact path format is:

- `artifacts/node/node-v<version>-win-x64.zip`

## Download procedure

### OpenClaw offline packages

Use:

```powershell
npm pack openclaw@<version> --pack-destination artifacts\openclaw
```

This produces:

- `artifacts/openclaw/openclaw-<version>.tgz`

### Node offline runtime

Preferred:

```powershell
curl.exe -L https://nodejs.org/dist/v<node-version>/node-v<node-version>-win-x64.zip -o artifacts\node\node-v<node-version>-win-x64.zip
```

If the official download is flaky, retry with a mirror only as a transport fallback. The file must still match the official SHA.

## Hashing procedure

After downloads finish, compute SHA-256 locally:

```powershell
Get-FileHash artifacts\openclaw\openclaw-<version>.tgz -Algorithm SHA256
Get-FileHash artifacts\node\node-v<node-version>-win-x64.zip -Algorithm SHA256
```

Write lowercase SHA-256 values into `artifacts/manifest.json`.

## Manifest update rules

### `artifacts/manifest.json`

For each chosen OpenClaw version:

- `version` must match the package version
- `artifact` must point to the local `.tgz`
- `sha256` must match the local file
- `requiredNode.version` must match the selected Node runtime
- `requiredNode.range` must satisfy the package's `engines.node`
- `requiredNode.artifact` must point to the local Node zip
- `requiredNode.sha256` must match the local file

### `artifacts/toolkit-manifest.json`

Update:

- `defaultOpenClawVersion` to the newest approved version
- `supportedOpenClawVersions` to the chosen stable set

## Validation checklist

Always validate with:

```powershell
pnpm --filter @openclaw-toolkit/desktop typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml version_catalog -- --nocapture
```

If tests fail only because a hard-coded expected version changed, update the test to the new default version and rerun.

Also inspect:

```powershell
Get-ChildItem artifacts\openclaw | Sort-Object Name | Select-Object Name,Length
Get-ChildItem artifacts\node | Sort-Object Name | Select-Object Name,Length
```

## Communication guidance

When reporting back:

- state the verified Feishu plugin stable version you used
- list the final OpenClaw offline versions added
- state the managed Node version chosen
- mention whether any older offline artifacts were replaced
- mention any login-gated or stale documentation caveats

## Boundaries

Do not:

- include beta OpenClaw builds in offline artifacts
- use GitHub source tarballs as installable offline packages
- update remote manifests unless the user asks
- silently keep an incompatible old Node runtime when the new OpenClaw line requires a newer one

## Fast playbook

Use this short sequence when executing:

1. Verify Feishu plugin compatibility upper bound.
2. Query stable `openclaw` versions from npm.
3. Choose upper bound plus previous 2-3 stable versions.
4. Read `engines.node` for those versions.
5. Download `.tgz` files into `artifacts/openclaw/`.
6. Download matching Node zip into `artifacts/node/`.
7. Compute SHA-256 for all new artifacts.
8. Rewrite `artifacts/manifest.json`.
9. Rewrite `artifacts/toolkit-manifest.json`.
10. Fix any version-catalog test expectations.
11. Run validation commands.
12. Report the final offline package set and Node requirement.
