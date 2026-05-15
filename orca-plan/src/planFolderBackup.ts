import type { PlanWorkspaceEntry } from "./types";

export type PlanFolderBackupFileV1 = {
  v: 1;
  kind: "orca-plan-project-backup";
  savedAt: string;
  project: PlanWorkspaceEntry;
};

export function buildFolderBackupPayload(project: PlanWorkspaceEntry): PlanFolderBackupFileV1 {
  return {
    v: 1,
    kind: "orca-plan-project-backup",
    savedAt: new Date().toISOString(),
    project,
  };
}
