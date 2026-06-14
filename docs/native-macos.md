# UGK Mini Agent for macOS

This guide covers macOS local deployment. MCP servers are user-managed runtime configuration and are not bundled or auto-detected by UGK Mini Agent.

## Requirements

- macOS 13 or newer
- Node.js 22+
- npm
- Python 3.11 or 3.12 available as `python3`
- Bash or POSIX `sh`

## Install

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:mac
```

## Start

From Terminal:

```bash
npm run native:start:mac
```

Or use Finder/Terminal:

```bash
./UGK-Mini-Agent-Launcher.command
```

To choose a port:

```bash
./UGK-Mini-Agent-Set-Port.command
```

## Update

For Git clone deployments, run:

```bash
./UGK-Mini-Agent-Update.command
```

The updater uses `origin/main`, installs dependencies when package files changed, then asks whether to restart the service.

## Runtime Data

Defaults are relative to the project root:

- `.data`
- `logs/native`
- `.data/tools`

Override with `UGK_DATA_DIR`, `UGK_LOG_DIR`, and `UGK_TOOLS_DIR` only when you need custom storage locations.

## First API Source

After startup, open `/playground/model-sources` and add a model provider and API key. No provider or API key is preinstalled.

## Troubleshooting

- If `node` is missing, install Node.js 22+ and reopen Terminal.
- If `python3` is missing, install Python 3.11/3.12 and ensure it is on PATH.
- If the port is occupied, use `UGK-Mini-Agent-Set-Port.command` or pass `--port`.
