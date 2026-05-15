/** Result of inspecting the folder bound as Orca’s coding project (Electron). */
export type WorkspaceCodingStatus =
  | {
      ok: true;
      isRepo: boolean;
      branch: string | null;
      claudeMdPath: "CLAUDE.md" | "claude.md" | null;
    }
  | { ok: false; error: string };
