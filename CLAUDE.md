# CLAUDE.md

Windows-native UGK Mini Agent runtime. See [README.md](README.md) for the full guide and [AGENTS.md](AGENTS.md) for AI collaboration rules.

## Quick Start

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor
npm run native:start
```

Default URLs (from `.env.native`):

- Main service / Playground: `$BASE_URL`
- Team Console / Canvas: `$BASE_URL/playground/team`

## Key Paths

| Responsibility | Path |
| --- | --- |
| Server assembly | `src/server.ts` |
| Runtime config | `src/config.ts` |
| Agent orchestration | `src/agent/agent-service.ts` |
| Session construction | `src/agent/agent-session-factory.ts` |
| Conn worker | `src/workers/conn-worker.ts` |
| Team worker | `src/workers/team-worker.ts` |
| Canvas Task runtime | `src/team/` |
| Canvas frontend | `apps/team-console/` |
| Native config | `scripts/native-runtime-config.mjs` |
| Native doctor | `scripts/native-doctor-core.mjs` |
| Native supervisor | `scripts/native-supervisor.mjs` |

## Verification

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```

See [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md) for change-scope-specific test suites.

## Rules

- Keep edits narrow and directly tied to the request.
- Do not hard-code ports, paths, or hostnames—use `.env.native` / config overrides.
- Treat `.env.native`, `.data/`, `logs/`, generated reports, and local credentials as runtime data—never commit.
