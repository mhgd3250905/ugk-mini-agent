# UGK Mini Agent for Windows

This repository is the Windows-native UGK Mini Agent runtime. The default local runtime starts the main agent service, Playground, Canvas Task runtime, Team worker, and Conn worker as local Node.js processes. Team Console is built into static assets and served by the main service.

User skills are installed under `runtime/skills-user/` or an agent profile skill directory. Browser automation, web search, and IM integration can be added as deployment-specific skills.

## Required Local Dependencies

- Node.js 22 or newer
- Git for Windows, including `Git\bin\bash.exe`
- Python 3.11 or 3.12

## Default URLs

- Main service, API, Playground: `http://127.0.0.1:8888`
- Team Console / Canvas: `http://127.0.0.1:8888/playground/team`

## Setup

```powershell
npm install
npm --prefix apps/team-console install
npm run native:doctor
npm run native:start
```

Open `http://127.0.0.1:8888/playground/model-sources` after startup and add the API source you want to use. A fresh runtime starts with no model providers.

## Runtime Shape

`npm run native:start` starts:

- `ugk-mini-agent-server`
- `ugk-mini-agent-team-worker`
- `ugk-mini-agent-conn-worker`

Before starting the long-running processes, the supervisor runs `npm run team-console:build` so the Canvas UI is served by the main service.

Logs are written to `logs/native/`.

## Extension Points

- `runtime/skills-user/`: shared user-installed skills
- `.data/agents/<agentId>/user-skills/`: per-agent skills
- `.data/agent/model-settings.json`: runtime model selection
- `.data/agent/model-providers.json`: user-added model providers and local API keys
- `.data/team/`: Canvas run state

Optional directory overrides:

- `UGK_DATA_DIR`: runtime data root, defaults to `.data`
- `UGK_LOG_DIR`: native supervisor log directory, defaults to `logs/native`
- `UGK_TOOLS_DIR`: portable/local tool cache, defaults to `.data/tools`
