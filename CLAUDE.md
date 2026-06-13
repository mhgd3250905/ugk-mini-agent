# CLAUDE.md

`ugk-claw-core-win` is the Windows-native UGK CLAW Core runtime.

## Commands

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor
npm run native:start
npm test
npx tsc --noEmit
npm run team-console:test
```

Default URLs:

- Main service / Playground: `http://127.0.0.1:8888`
- Team Console / Canvas: `http://127.0.0.1:9999`

## Runtime Shape

The default local runtime starts these processes:

- `ugk-claw-core-win-server`
- `ugk-claw-core-win-team-console`
- `ugk-claw-core-win-team-worker`
- `ugk-claw-core-win-conn-worker`

User skills live under `runtime/skills-user/` by default. Browser automation, web search, and IM integrations are installed as user skills when a deployment needs them.

## Key Paths

- `src/server.ts`: server assembly
- `src/config.ts`: runtime path/env config
- `src/agent/agent-service.ts`: chat/session orchestration
- `src/agent/agent-session-factory.ts`: pi-coding-agent session construction
- `src/workers/conn-worker.ts`: Conn background worker
- `src/workers/team-worker.ts`: Team runtime worker
- `src/team/`: Canvas Task runtime
- `apps/team-console/`: Canvas frontend
- `scripts/native-runtime-config.mjs`: native env/process config
- `scripts/native-doctor-core.mjs`: native prerequisite checks
- `scripts/native-supervisor.mjs`: local multi-process supervisor

## Rules

- Keep edits narrow and directly tied to the request.
- Preserve Windows-native defaults: main port `8888`, Team Console port `9999`.
- Treat `.env.native`, `.data/`, `logs/`, generated reports, and local credentials as runtime data.
