import type { PlanWorkspaceEntry } from "../types";
import { buildFolderBackupPayload } from "../planFolderBackup";
import { canWritePlanFolderBackup, writePlanFolderBackup } from "../orcaPlanHost";

let loggedBrowserBackupSkip = false;

/** Writes each project's plan to `<workspaceRoot>/.orca-plan/plan.json` when a root is set (Electron only). */
export async function flushPlanBackupsToWorkspaceFolders(projects: PlanWorkspaceEntry[]): Promise<void> {
  if (!canWritePlanFolderBackup()) {
    if (!loggedBrowserBackupSkip) {
      loggedBrowserBackupSkip = true;
      console.info(
        "[orca-plan] Folder backup skipped: run via `npm run dev:electron` or `npm run start:electron` (browser has no disk access).",
      );
    }
    return;
  }

  const tasks: Promise<{ ok: true } | { ok: false; error: string }>[] = [];
  for (const p of projects) {
    const root = p.workspaceRoot?.trim();
    if (!root) continue;
    tasks.push(writePlanFolderBackup(root, buildFolderBackupPayload(p)));
  }

  if (import.meta.env.DEV && tasks.length > 0) {
    console.debug(`[orca-plan] Writing ${tasks.length} folder backup(s)…`);
  }

  const results = await Promise.all(tasks);
  for (const r of results) {
    if (!r.ok) console.warn("[orca-plan] Folder backup failed:", r.error);
  }
}
