# Native Update Scripts Design

## Goal

Provide simple update entry points for Windows, macOS, and Linux so clone users can update UGK Mini Agent without manually running Git and npm commands.

## User Flow

Users run the platform-specific update entry from the project root:

- Windows: `UGK-Mini-Agent-Update.cmd`
- macOS: `UGK-Mini-Agent-Update.command`
- Linux: `UGK-Mini-Agent-Update.sh`

The updater fetches and fast-forwards `origin/main`, installs dependencies when package files changed, then asks whether to restart UGK Mini Agent.

If the user chooses restart, the updater starts the existing native launcher. The launcher already handles the selected port, stops old processes occupying that port, and starts the native supervisor.

## Update Behavior

The update target is always `origin/main`.

The updater reuses the existing clone update rules:

- Block automatic update when tracked or unapproved local code changes exist.
- Allow runtime artifacts such as `.data/`, `logs/`, `node_modules/`, and `.env.native`.
- Run `npm install` when root package files changed.
- Run `npm --prefix apps/team-console install` when Team Console package files changed.

This keeps script behavior aligned with the existing `/playground/update` page.

## Components

### `scripts/native-updater.mjs`

Node-based shared update runner used by all platforms.

Responsibilities:

- Check that the project is a Git clone.
- Run the existing clone update flow against `origin/main`.
- Print clear status and blocking-change messages.
- Prompt `Restart UGK Mini Agent now? [Y/n]` after a successful update.
- Start `scripts/native-launcher.mjs` when the user accepts restart.

### Platform Entry Scripts

Root-level scripts stay thin and only check Node.js before calling the shared updater:

- `UGK-Mini-Agent-Update.cmd`
- `UGK-Mini-Agent-Update.command`
- `UGK-Mini-Agent-Update.sh`

They match the existing launcher script style.

## Error Handling

- If Node.js is missing, the platform script prints a short installation hint.
- If Git update is blocked by local code changes, the updater lists those changes and exits without modifying them.
- If dependency installation fails, the updater exits with the failing command error.
- If restart fails, the existing native launcher reports the startup failure.

## Testing

Add focused tests for the shared updater behavior where practical:

- Successful update asks for restart.
- Blocking local changes prevent pull.
- Restart choice invokes the native launcher.

Run native/update related tests plus type checking:

```powershell
node --test --test-concurrency=1 --import tsx test\clone-updater.test.ts
npx tsc --noEmit
git diff --check
```
