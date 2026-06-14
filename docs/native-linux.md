# UGK Mini Agent for Linux

This guide covers Linux local deployment. MCP servers are user-managed runtime configuration and are not bundled or auto-detected by UGK Mini Agent.

## Requirements

- Node.js 22+
- npm
- Python 3.11 or 3.12 available as `python3`
- Bash or POSIX `sh`
- `lsof` for automatic launcher port cleanup

## Install

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:linux
```

## Start

```bash
npm run native:start:linux
```

Or:

```bash
./UGK-Mini-Agent-Launcher.sh
```

To choose a port:

```bash
./UGK-Mini-Agent-Set-Port.sh
```

## Update

For Git clone deployments, run:

```bash
./UGK-Mini-Agent-Update.sh
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

- If `node` is missing, install Node.js 22+ using your distribution package manager, NodeSource, fnm, mise, or nvm.
- If `python3` is missing, install Python 3.11/3.12.
- If automatic port cleanup does not work, install `lsof` or choose another port.
