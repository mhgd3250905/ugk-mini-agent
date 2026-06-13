---
name: conn-maintenance
description: Use when the user asks to diagnose slow conn/background tasks, inspect conn run logs, estimate or clean old conn SQLite event logs, run conn database maintenance, or handle Chinese requests like “清理后台任务日志”, “conn 变慢”, “清理一周前日志”, “SQLite 太大”, “后台任务运行慢”, or “帮我瘦身 conn 数据库”. Always start with read-only inspection and dry-run before any cleanup.
---

# Conn Maintenance

Use this skill to diagnose and safely maintain ugk-claw-core-win background task (`conn`) runtime data.

The goal is not to delete tasks. The goal is to keep the conn event log usable by trimming old, noisy process events while preserving task records, summaries, output files, and recent run evidence.

## Safety Model

Treat conn database maintenance as a local production data operation.

- Start with read-only facts.
- Run dry-run before any cleanup.
- Show the user the exact impact numbers.
- Wait for explicit user confirmation before applying cleanup.
- Back up the local conn directory, or at least `conn.sqlite*`, before applying cleanup.
- Prefer a maintenance window where the core service and conn worker are stopped before applying cleanup and `VACUUM`.
- Never delete `conn.sqlite`.
- Never delete `conn_runs`.
- Never delete `conn_run_files`.
- Never edit SQLite tables manually.
- Never clean browser profiles, agent sessions, assets, custom agent profiles, or skills as part of conn log cleanup.

If you cannot stop the app and worker from your environment, do not pretend you performed safe maintenance. Give the user the exact host commands or ask them to run the maintenance from an ops-capable session.

## What Is Safe To Clean

The maintenance script only removes old rows from `conn_run_events`.

It preserves:

- conn definitions
- run records
- run status
- `result_text`
- `result_summary`
- error text
- indexed output files
- each conn's latest runs, according to the retention setting

Default retention:

- Keep detailed events from the last 7 days.
- Always keep detailed events for the latest 3 runs per conn.

## Read-Only Inspection

First gather facts. Prefer API/tool reads for user-facing state:

- `GET /v1/conns`
- `GET /v1/conns/:connId/runs`
- `GET /v1/conns/:connId/runs/:runId`
- `GET /v1/conns/:connId/runs/:runId/events`
- `GET /v1/debug/runtime`

If a `conn` tool is available, use:

- `conn(action="list")`
- `conn(action="list_runs", connId=...)`
- `conn(action="get_run", connId=..., runId=...)`

For database-size symptoms, inspect the runtime DB path from `/v1/debug/runtime` or use the standard Windows Core path:

```powershell
.data\agent\conn\conn.sqlite
```

Useful read-only checks from the project directory:

```powershell
Get-ChildItem .data\agent\conn\conn.sqlite*
node scripts\maintain-conn-db.mjs --db .data\agent\conn\conn.sqlite --keep-days 7 --keep-latest-runs-per-conn 3 --dry-run --json
```

## Dry-Run First

Always run dry-run before cleanup:

```powershell
node scripts\maintain-conn-db.mjs `
  --db .data\agent\conn\conn.sqlite `
  --keep-days 7 `
  --keep-latest-runs-per-conn 3 `
  --dry-run `
  --json
```

Explain the result:

- `expiredRunCount`: how many old runs would lose detailed event rows.
- `deletedEventCount`: how many `conn_run_events` rows would be deleted.
- `cutoff`: events older than this cutoff are eligible, except each conn's latest kept runs.
- `dryRun: true`: confirms nothing was changed.

If `deletedEventCount` is `0`, do not apply cleanup. Tell the user cleanup is unnecessary and continue diagnosing other causes.

## Confirmation Gate

Before applying cleanup, use this format:

```text
我先做了 dry-run，没有改数据库：

- 数据库：.data\agent\conn\conn.sqlite
- 保留策略：最近 7 天 + 每个 conn 最近 3 次 run
- 会清理的旧 run 数：<expiredRunCount>
- 会删除的事件行数：<deletedEventCount>
- 不会删除：conn 任务、run 记录、结果摘要、输出文件

正式清理需要维护窗口，建议先停止 core service 和 conn worker，再执行清理和 VACUUM。
请确认是否执行正式清理。
```

Do not apply cleanup until the user explicitly confirms.

## Apply Cleanup

Preferred Windows Core flow from the project directory. Back up the local conn directory first.

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force .data\backups | Out-Null
Copy-Item -Recurse .data\agent\conn ".data\backups\conn-pre-maintenance-$stamp"
node scripts\maintain-conn-db.mjs `
  --db .data\agent\conn\conn.sqlite `
  --keep-days 7 `
  --keep-latest-runs-per-conn 3
```

The maintenance script runs `VACUUM` and `PRAGMA wal_checkpoint(TRUNCATE)` by default after deleting rows. Only say it skipped vacuum when the command explicitly used `--no-vacuum` or the result reports `vacuumed=false`.

## After Cleanup

Verify:

- Resolve the current service base URL from `PUBLIC_BASE_URL`, or from `HOST`/`PORT` in `.env.native`.
- App health: `GET $BASE_URL/healthz`
- Runtime health: `GET $BASE_URL/v1/debug/runtime`
- Conn list loads: `GET $BASE_URL/v1/conns`
- Recent run details still load: `GET $BASE_URL/v1/conns/:connId/runs`
- Output files for recent runs still open.

Report:

- whether cleanup was dry-run or applied
- retention settings
- deleted event rows
- whether `VACUUM` ran
- verification result

## If The System Is Still Slow

If cleanup does not explain the slowness, continue diagnosis instead of running more deletes.

Check:

- active conn run backlog
- app and conn-worker logs
- model provider latency
- `/v1/debug/runtime`
- local CPU, memory, disk I/O

Do not broaden cleanup to unrelated runtime data unless the user explicitly asks and you have a separate, evidence-based plan.
