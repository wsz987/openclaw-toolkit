# OpenClaw Runtime Host Stability Design

## Scope

Improve startup stability and polling cost for the desktop runtime host. This
change does not add automatic restart, Windows Service integration, or a new
IPC transport.

## Problem

The external host waits four seconds for its daemon to publish `state.json`.
Before publishing that state, it calls the full OpenClaw status reader. The
full reader invokes `openclaw.mjs plugins list --json`, which can take more
than four seconds on installations with several plugins. The client therefore
reports a failed start while the daemon is still initializing.

The same full status reader is also used by polling paths. This repeatedly
starts a Node process for plugin discovery even when neither the configuration
nor the installed plugins changed.

## Design

### Lightweight Runtime Context

Introduce a runtime-only context containing the config path, OpenClaw
directory, managed Node directory, gateway URL, and runtime log path. It is
derived from `openclaw.json` and `installed-manifest.json` without plugin
discovery or control-panel requests.

`openclaw-host` uses this context during daemon initialization and to launch
the gateway. It writes `state.json` immediately after this lightweight context
is available. The daemon-ready timeout becomes 30 seconds to tolerate slow
local disks and antivirus activity without prolonging normal startup.

### Host Polling

The host keeps its command-file check at 800 ms so explicit start, stop, and
restart actions remain responsive. Runtime reconciliation runs at most every
five seconds:

- A recorded PID is checked first.
- If that PID no longer exists, a local gateway probe determines whether an
  externally retained gateway owns the configured port.
- No reconciliation path invokes `plugins list --json`.

The host still only reports state. It does not restart an exited process.

### GUI Status Polling

The GUI keeps its current 2.5-second running and 10-second stopped refresh
cadence. Plugin discovery is cached per configuration path for 60 seconds.
The cache is invalidated immediately when the configuration file modification
time changes. A failed discovery preserves the existing fallback behavior.

This keeps frequent UI updates cheap while ensuring a configuration change is
visible on the next status read.

## Data Flow

```text
start command
  -> lightweight runtime context
  -> host state.json (ready)
  -> command.json
  -> node openclaw.mjs gateway

GUI status refresh
  -> gateway/PID/config checks
  -> plugin cache hit, or one CLI discovery per config per 60 seconds
```

## Error Handling

- A missing config, manifest, Node executable, or OpenClaw entry returns a
  specific start error before the gateway is spawned.
- A gateway probe failure records `stopped` without treating it as a plugin
  discovery failure.
- Cache failures continue to use the manifest/config fallback already present
  in the full status reader.

## Tests

- Runtime-context construction does not invoke plugin discovery.
- A daemon can publish readiness without waiting for plugin discovery.
- Plugin discovery cache is reused before 60 seconds elapse.
- A configuration modification invalidates the cached plugin discovery.
- Runtime reconciliation follows the five-second schedule and uses no plugin
  discovery.

## Non-Goals

- Restart policies, crash-loop backoff, and circuit breaking.
- Windows Service installation or startup recovery after machine reboot.
- Replacement of file-based command IPC.
