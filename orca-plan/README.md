# Orca Plan

Standalone app distilled from the Orca POC: **projects grid** + **parallel tracks / items plan** only. No board, chat, item workflow states, or modals.

## Run

```bash
cd orca-plan
npm install   # if needed
npm run dev
```

Default dev server prints a URL (often `http://localhost:5173`).

### Electron (desktop window)

Runs the same UI in a **BrowserWindow**: dev uses the Vite server; production loads the built `dist/` assets.

```bash
npm run dev:electron    # Vite + Electron on http://127.0.0.1:5180 (ORCA_PLAN_DEV_PORT)

# Equivalent (what the script runs — avoids `electron .` resolving the wrong package when cwd is off):
# ORCA_PLAN_DEV_PORT=5180 node ./node_modules/electron/cli.js ./electron/main.cjs --dev
```

```bash
npm run build && npm run start:electron   # built app, no dev server
```

**After changing `electron/main.cjs` or `electron/preload.cjs`:** fully **quit** the Orca Plan app (⌘Q on macOS) and run `dev:electron` again. The **main process does not hot-reload**; only the Vite UI does. If you see `No handler registered for 'orca-plan:…'`, you are talking to an Electron main that never registered that channel — almost always a **stale** Orca Plan process, or you started **`npm run dev` in the browser** and somehow mixed URLs/windows. Fix: quit all Orca Plan windows, then from **`orca-plan/`** run only **`npm run dev:electron`** (that command starts both Vite and Electron with the right `main`).

## Data

- Persisted in **`localStorage`** under `orca-plan.workspace.v1`.
- Snapshot shape: `PlanProjectSnapshot` (`src/types.ts`) — tracks, item groups, items.
- Each project may include **`workspaceRoot`** (absolute path). Set it on the **Projects** page: **project card → Folder** (**Browse** / **Edit path** in Electron, or paste when using the browser dev server alone).
- **Import from disk (Electron):** **Projects → Import from plan.json…** merges backups (`kind: orca-plan-project-backup`) into the grid—e.g. select `…/your-repo/.orca-plan/plan.json`. The grid is still **`localStorage`**; folders on disk are not scanned automatically.
- **Electron backup:** when `workspaceRoot` is set, the app **debounces ~350ms** and writes **`<workspaceRoot>/.orca-plan/plan.json`**. Source of truth remains **`localStorage`**; the file is a duplicate on disk.
- **Important:** `localStorage` is **per page URL**. **`http://127.0.0.1:5180`** (Electron dev), **`http://localhost:5173`** (plain `npm run dev`), and **`file://`…** (`npm run start:electron`) keep **separate** project lists — set the folder and edit the plan in the **same** mode you use day-to-day or you won’t see `workspaceRoot`/backups where you expect.
- **Files sidebar (Electron):** **Git** (branch or **Initialize Git here**) and **`CLAUDE.md`** **auto-created** when missing. Orca does not overwrite **`CLAUDE.md`** after creation.
- **Claude Code panel (Electron):** With a project folder set, the **right** column runs **`claude`** in a **real PTY** (via `node-pty`) rendered with **xterm.js**—the same interactive CLI as in Terminal, with **`cwd`** = project folder. **`claude` must be on your PATH**, or set **`ORCA_PLAN_CLAUDE_CMD`** (executable name or path). Optional **`ORCA_PLAN_CLAUDE_ARGS`**: JSON array of strings, e.g. `["--verbose"]`, or space-separated flags. **`npm install`** runs **`electron-rebuild`** for `node-pty` (run again after changing the **Electron** version).

## Next steps (your roadmap)

- Add fields on `PlanTrackItem` (e.g. `gitBranch`, `agentSessionId`) and wire “start agent on branch” from your environment.

## Relation to `orca/`

The main repo at `../` remains the full demo. This folder is a **clean copy** of the plan UI you liked, trimmed for day-to-day use.
