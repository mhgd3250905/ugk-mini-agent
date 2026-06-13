# Traceability Map

这份文档用于快速定位 Windows Core 项目的主要入口。

## 快速接手

1. `AGENTS.md`
2. `README.md`
3. `docs/native-windows-core.md`
4. `src/server.ts`
5. `src/config.ts`
6. `src/agent/agent-service.ts`
7. `src/agent/agent-session-factory.ts`
8. `src/workers/conn-worker.ts`
9. `src/workers/team-worker.ts`
10. `apps/team-console/README.md`

默认入口：

- 主服务 / Playground：`http://127.0.0.1:8888`
- Team Console / Canvas：`http://127.0.0.1:8888/playground/team`

## Chat / Agent

- `src/routes/chat.ts`
- `src/routes/chat-route-parsers.ts`
- `src/routes/chat-sse.ts`
- `src/agent/agent-service.ts`
- `src/agent/agent-session-factory.ts`
- `src/agent/agent-service-registry.ts`
- `src/agent/agent-profile.ts`
- `src/agent/agent-profile-catalog.ts`
- `src/routes/agent-profiles.ts`

## Playground

- `src/routes/playground.ts`
- `src/ui/playground.ts`
- `src/ui/playground-page-shell.ts`
- `src/ui/playground-styles.ts`
- `src/ui/playground-stream-controller.ts`
- `src/ui/playground-agent-manager.ts`
- `docs/playground-current.md`

## Files / Assets / Artifacts

- `src/routes/files.ts`
- `src/routes/assets.ts`
- `src/routes/artifacts.ts`
- `src/agent/asset-store.ts`
- `src/agent/file-artifacts.ts`
- `src/agent/agent-prompt-assets.ts`
- `src/agent/artifact-contract.ts`
- `src/agent/artifact-validation.ts`
- `.pi/extensions/send-file.ts`

## Conn

- `src/routes/conns.ts`
- `src/routes/conn-route-parsers.ts`
- `src/routes/conn-route-presenters.ts`
- `src/agent/conn-db.ts`
- `src/agent/conn-sqlite-store.ts`
- `src/agent/conn-run-store.ts`
- `src/agent/background-agent-runner.ts`
- `src/agent/background-workspace.ts`
- `src/workers/conn-worker.ts`

## Team Console / Canvas

- `apps/team-console/README.md`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `src/team/types.ts`
- `src/team/routes.ts`
- `src/team/task-run-service.ts`
- `src/team/run-workspace.ts`
- `src/team/orchestrator.ts`
- `src/workers/team-worker.ts`
- `docs/team-runtime.md`

## Skills

- Project skills: `.pi/skills/`
- Shared user skills: `runtime/skills-user/`
- Agent profile skills: `.data/agents/<agentId>/user-skills/`
- Runtime skill debug: `GET /v1/debug/skills`
- Agent skill debug: `GET /v1/agents/:agentId/debug/skills`

The default shared user-skill directory starts empty. Deployment-specific capabilities are installed as user skills.

## Native Runtime

- Runtime config: `scripts/native-runtime-config.mjs`
- Doctor: `scripts/native-doctor-core.mjs`
- Env loader: `scripts/native-env.mjs`
- Supervisor plan: `scripts/native-supervisor-core.mjs`
- Supervisor CLI: `scripts/native-supervisor.mjs`
- Env template: `.env.native.example`

Verification:

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```
