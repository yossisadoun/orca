import type { PlanFolderBackupFileV1 } from "./planFolderBackup";
import type { PlanProjectSnapshot, PlanWorkspaceEntry } from "./types";
import type { WorkspaceCodingStatus } from "./workspaceCoding";

/** Exposed from `electron/preload.cjs` when running inside Orca Plan’s Electron shell. */
export type WorkspaceFsEntry = {
  name: string;
  isDirectory: boolean;
  relPath: string;
};

export type ListWorkspaceDirResult =
  | { ok: true; entries: WorkspaceFsEntry[] }
  | { ok: false; error: string };

export type OrcaPlanHostAPI = {
  pickWorkspaceFolder: () => Promise<string | null>;
  writeProjectBackup: (
    workspaceRoot: string,
    payload: PlanFolderBackupFileV1,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  getWorkspaceCodingStatus: (workspaceRoot: string) => Promise<unknown>;
  gitInitWorkspace: (workspaceRoot: string) => Promise<unknown>;
  createClaudeMdStub: (
    workspaceRoot: string,
    projectTitle: string,
  ) => Promise<unknown>;
  listWorkspaceDir: (workspaceRoot: string, relativePath: string) => Promise<unknown>;
  revealWorkspacePath: (workspaceRoot: string, relativePath: string) => Promise<unknown>;
  startWorkspaceFsWatch: (workspaceRoot: string) => Promise<unknown>;
  stopWorkspaceFsWatch: () => Promise<unknown>;
  onWorkspaceFsChanged: (callback: (payload: { workspaceRoot: string }) => void) => () => void;
  ptySpawn: (opts: { workspaceRoot: string; cols: number; rows: number; sessionKey: string; resumeSessionId?: string; systemPrompt?: string }) => Promise<unknown>;
  ptyConnect: (sessionKey: string) => Promise<unknown>;
  ptyMarkSeen: (sessionKey: string) => Promise<unknown>;
  ptyUnseenSessions: () => Promise<unknown>;
  ptyList: () => Promise<unknown>;
  ptyWrite: (sessionKey: string, data: string) => Promise<unknown>;
  ptyResize: (sessionKey: string, cols: number, rows: number) => Promise<unknown>;
  ptyKill: (sessionKey?: string) => Promise<unknown>;
  onPtyData: (callback: (sessionKey: string, data: Uint8Array) => void) => () => void;
  onPtyExit: (callback: (sessionKey: string, payload: { exitCode: number; signal: number | null }) => void) => () => void;
  /** Dev/diagnostic: confirms this window’s main process loaded `electron/main.cjs` with IPC registered. */
  hostPing?: () => Promise<{ ok: boolean; main?: string; pid?: number }>;
  pickImportPlanBackups?: () => Promise<unknown>;
  loadWorkspaceFromDisk?: () => Promise<unknown>;
  saveWorkspaceToDisk?: (projects: PlanWorkspaceEntry[], lastActiveProjectId: string | null) => Promise<unknown>;
  detectClaudeSession?: (workspaceRoot: string) => Promise<unknown>;
  writeTaskContext?: (workspaceRoot: string, itemId: string, content: string) => Promise<unknown>;
  readScreenshot?: (workspaceRoot: string, relativePath: string) => Promise<unknown>;
  detectGitHub?: (workspaceRoot: string) => Promise<unknown>;
  ensurePlanSchema?: (workspaceRoot: string) => Promise<unknown>;
  listDocs?: (workspaceRoot: string) => Promise<unknown>;
  readDoc?: (workspaceRoot: string, filename: string) => Promise<unknown>;
  writeDoc?: (workspaceRoot: string, filename: string, content: string, allDocFilenames: string[]) => Promise<unknown>;
  readPlanBackup?: (workspaceRoot: string) => Promise<unknown>;
  savePlanVersion?: (workspaceRoot: string, source: string, snapshotJson: string) => Promise<unknown>;
  listPlanVersions?: (workspaceRoot: string) => Promise<unknown>;
  loadPlanVersion?: (workspaceRoot: string, filename: string) => Promise<unknown>;
};

declare global {
  interface Window {
    orcaPlan?: OrcaPlanHostAPI;
  }
}

export function canPickWorkspaceFolder(): boolean {
  return typeof window.orcaPlan?.pickWorkspaceFolder === "function";
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  const fn = window.orcaPlan?.pickWorkspaceFolder;
  if (!fn) return null;
  try {
    const p = await fn();
    return typeof p === "string" && p.length > 0 ? p : null;
  } catch {
    return null;
  }
}

export function canWritePlanFolderBackup(): boolean {
  return typeof window.orcaPlan?.writeProjectBackup === "function";
}

export function canUseWorkspaceCodingTools(): boolean {
  return typeof window.orcaPlan?.getWorkspaceCodingStatus === "function";
}

export function canUseWorkspaceFileTree(): boolean {
  const api = window.orcaPlan;
  return (
    typeof api?.listWorkspaceDir === "function" &&
    typeof api?.startWorkspaceFsWatch === "function" &&
    typeof api?.stopWorkspaceFsWatch === "function" &&
    typeof api?.onWorkspaceFsChanged === "function"
  );
}

export function canUseWorkspacePty(): boolean {
  const api = window.orcaPlan;
  return (
    typeof api?.ptySpawn === "function" &&
    typeof api?.ptyWrite === "function" &&
    typeof api?.ptyResize === "function" &&
    typeof api?.ptyKill === "function" &&
    typeof api?.onPtyData === "function" &&
    typeof api?.onPtyExit === "function"
  );
}

function isPlanWorkspaceEntry(p: unknown): p is PlanWorkspaceEntry {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return false;
  const snap = o.snapshot;
  if (!snap || typeof snap !== "object") return false;
  const s = snap as Record<string, unknown>;
  if (s.v !== 1) return false;
  if (!Array.isArray(s.planTracks) || !Array.isArray(s.planItemGroups) || !Array.isArray(s.planTrackItems)) return false;
  if (o.workspaceRoot !== undefined && typeof o.workspaceRoot !== "string") return false;
  return true;
}

export function canPickImportPlanBackups(): boolean {
  return typeof window.orcaPlan?.pickImportPlanBackups === "function";
}

export async function pickImportPlanBackups(): Promise<
  | { ok: true; projects: PlanWorkspaceEntry[]; errors: string[] }
  | { ok: false; error: string }
> {
  const fn = window.orcaPlan?.pickImportPlanBackups;
  if (!fn) return { ok: false, error: "Import is only available in Orca Plan Electron" };
  try {
    const raw: unknown = await fn();
    if (!raw || typeof raw !== "object" || !("ok" in raw)) {
      return { ok: false, error: "Invalid response from Electron" };
    }
    const o = raw as { ok?: unknown; projects?: unknown; errors?: unknown; error?: unknown };
    if (o.ok !== true) {
      const err = typeof o.error === "string" ? o.error : "Import failed";
      return { ok: false, error: err };
    }
    if (!Array.isArray(o.projects)) {
      return { ok: false, error: "Invalid projects array" };
    }
    const validated = o.projects.filter((p): p is PlanWorkspaceEntry => isPlanWorkspaceEntry(p));
    const errors = Array.isArray(o.errors) ? o.errors.filter((e): e is string => typeof e === "string") : [];
    return { ok: true, projects: validated, errors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listWorkspaceDir(
  workspaceRoot: string,
  relativePath: string,
): Promise<ListWorkspaceDirResult> {
  const fn = window.orcaPlan?.listWorkspaceDir;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), relativePath);
    if (
      raw &&
      typeof raw === "object" &&
      "ok" in raw &&
      (raw as { ok: unknown }).ok === true &&
      "entries" in raw &&
      Array.isArray((raw as { entries: unknown }).entries)
    ) {
      const entries = (raw as { entries: unknown[] }).entries
        .map((e) => {
          if (!e || typeof e !== "object") return null;
          const o = e as { name?: unknown; isDirectory?: unknown; relPath?: unknown };
          if (typeof o.name !== "string" || typeof o.relPath !== "string" || typeof o.isDirectory !== "boolean") {
            return null;
          }
          return { name: o.name, isDirectory: o.isDirectory, relPath: o.relPath };
        })
        .filter((x): x is WorkspaceFsEntry => x != null);
      return { ok: true, entries };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Unknown error listing workspace folder";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revealWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.revealWorkspacePath;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), relativePath);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Could not reveal path";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function startWorkspaceFsWatch(workspaceRoot: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.startWorkspaceFsWatch;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Could not start file watcher";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function stopWorkspaceFsWatch(): Promise<void> {
  const fn = window.orcaPlan?.stopWorkspaceFsWatch;
  if (!fn) return;
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

export function subscribeWorkspaceFsChanged(cb: (payload: { workspaceRoot: string }) => void): (() => void) | null {
  const fn = window.orcaPlan?.onWorkspaceFsChanged;
  if (!fn) return null;
  return fn(cb);
}

export async function getWorkspaceCodingStatus(workspaceRoot: string): Promise<WorkspaceCodingStatus> {
  const fn = window.orcaPlan?.getWorkspaceCodingStatus;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (
      raw &&
      typeof raw === "object" &&
      "ok" in raw &&
      (raw as { ok: unknown }).ok === true &&
      "isRepo" in raw &&
      "branch" in raw &&
      "claudeMdPath" in raw
    ) {
      const o = raw as {
        isRepo: boolean;
        branch: string | null;
        claudeMdPath: "CLAUDE.md" | "claude.md" | null;
      };
      return {
        ok: true,
        isRepo: o.isRepo,
        branch: o.branch,
        claudeMdPath: o.claudeMdPath,
      };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Unknown error from Electron";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function gitInitWorkspace(
  workspaceRoot: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.gitInitWorkspace;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "git init failed";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createClaudeMdStub(
  workspaceRoot: string,
  projectTitle: string,
): Promise<{ ok: true; created: boolean; path?: string } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.createClaudeMdStub;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), projectTitle);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      const o = raw as { created?: boolean; path?: string };
      return { ok: true, created: Boolean(o.created), path: o.path };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Could not create CLAUDE.md";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function writePlanFolderBackup(
  workspaceRoot: string,
  payload: PlanFolderBackupFileV1,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.writeProjectBackup;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), payload);
    if (
      raw &&
      typeof raw === "object" &&
      "ok" in raw &&
      (raw as { ok: unknown }).ok === true
    ) {
      return { ok: true };
    }
    const err =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Unknown error from Electron";
    return { ok: false, error: raw ? err : "Invalid response from Electron" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function ptySpawn(opts: {
  workspaceRoot: string;
  cols: number;
  rows: number;
  sessionKey: string;
  resumeSessionId?: string;
  systemPrompt?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.ptySpawn;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn({
      workspaceRoot: opts.workspaceRoot.trim(),
      cols: opts.cols,
      rows: opts.rows,
      sessionKey: opts.sessionKey,
      resumeSessionId: opts.resumeSessionId,
      systemPrompt: opts.systemPrompt,
    });
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true };
    }
    const err =
      raw && typeof raw === "object" && "error" in raw && typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Could not start Claude session";
    return { ok: false, error: err };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/No handler registered/i.test(msg)) {
      return {
        ok: false,
        error:
          `${msg} — Start Orca Plan from the orca-plan folder: \`npm run dev:electron\` (uses \`electron/main.cjs\` explicitly). Quit all Electron windows first. In DevTools try: \`await window.orcaPlan.hostPing()\` — you should see \`ok: true\` and \`main\` ending in \`electron/main.cjs\`. If \`hostPing\` also errors, this window is not using Orca Plan’s main process.`,
      };
    }
    return { ok: false, error: msg };
  }
}

export async function ptyConnect(sessionKey: string): Promise<{ ok: true; buffer: string } | { ok: false; exists: boolean }> {
  const fn = window.orcaPlan?.ptyConnect;
  if (!fn) return { ok: false, exists: false };
  try {
    const raw: unknown = await fn(sessionKey);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true, buffer: (raw as { buffer?: string }).buffer ?? "" };
    }
    return { ok: false, exists: false };
  } catch {
    return { ok: false, exists: false };
  }
}

export async function ptyWrite(sessionKey: string, data: string): Promise<void> {
  const fn = window.orcaPlan?.ptyWrite;
  if (!fn) return;
  try {
    await fn(sessionKey, data);
  } catch {
    /* ignore */
  }
}

export async function ptyResize(sessionKey: string, cols: number, rows: number): Promise<void> {
  const fn = window.orcaPlan?.ptyResize;
  if (!fn) return;
  try {
    await fn(sessionKey, cols, rows);
  } catch {
    /* ignore */
  }
}

export async function ptyKill(sessionKey?: string): Promise<void> {
  const fn = window.orcaPlan?.ptyKill;
  if (!fn) return;
  try {
    await fn(sessionKey);
  } catch {
    /* ignore */
  }
}

export function subscribePtyData(cb: (sessionKey: string, data: Uint8Array) => void): (() => void) | null {
  const fn = window.orcaPlan?.onPtyData;
  if (!fn) return null;
  return fn(cb);
}

export function subscribePtyExit(
  cb: (sessionKey: string, payload: { exitCode: number; signal: number | null }) => void,
): (() => void) | null {
  const fn = window.orcaPlan?.onPtyExit;
  if (!fn) return null;
  return fn(cb);
}

/* ---------------------------------------------------------------------------
 * Disk-primary workspace persistence (Electron only)
 * ---------------------------------------------------------------------------*/

export function canLoadWorkspaceFromDisk(): boolean {
  return typeof window.orcaPlan?.loadWorkspaceFromDisk === "function";
}

export async function loadWorkspaceFromDisk(): Promise<
  | { ok: true; projects: PlanWorkspaceEntry[]; lastActiveProjectId: string | null }
  | { ok: false; error: string }
> {
  const fn = window.orcaPlan?.loadWorkspaceFromDisk;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn();
    if (!raw || typeof raw !== "object" || !("ok" in raw)) {
      return { ok: false, error: "Invalid response from Electron" };
    }
    const o = raw as { ok?: unknown; projects?: unknown; lastActiveProjectId?: unknown; error?: unknown };
    if (o.ok !== true) {
      return { ok: false, error: typeof o.error === "string" ? o.error : "Load failed" };
    }
    const projects = Array.isArray(o.projects)
      ? o.projects.filter((p): p is PlanWorkspaceEntry => isPlanWorkspaceEntry(p))
      : [];
    const lastActiveProjectId =
      typeof o.lastActiveProjectId === "string" ? o.lastActiveProjectId : null;
    return { ok: true, projects, lastActiveProjectId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function canSaveWorkspaceToDisk(): boolean {
  return typeof window.orcaPlan?.saveWorkspaceToDisk === "function";
}

export async function saveWorkspaceToDisk(
  projects: PlanWorkspaceEntry[],
  lastActiveProjectId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.saveWorkspaceToDisk;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(projects, lastActiveProjectId);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true };
    }
    const err =
      raw && typeof raw === "object" && "error" in raw && typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "Save failed";
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------------------
 * Claude session detection
 * ---------------------------------------------------------------------------*/

export type ClaudeSessionInfo = { id: string; modifiedAt: string };

export async function detectClaudeSessions(
  workspaceRoot: string,
): Promise<ClaudeSessionInfo[]> {
  const fn = window.orcaPlan?.detectClaudeSession;
  if (!fn) return [];
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (
      raw &&
      typeof raw === "object" &&
      "ok" in raw &&
      (raw as { ok: unknown }).ok === true &&
      "sessions" in raw &&
      Array.isArray((raw as { sessions: unknown }).sessions)
    ) {
      return (raw as { sessions: unknown[] }).sessions.filter(
        (s): s is ClaudeSessionInfo =>
          !!s && typeof s === "object" && typeof (s as { id: unknown }).id === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

export async function writeTaskContext(
  workspaceRoot: string,
  itemId: string,
  content: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.writeTaskContext;
  if (!fn) return { ok: false, error: "Not running in Orca Plan Electron shell" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), itemId, content);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      return { ok: true, path: (raw as { path?: string }).path ?? "" };
    }
    return { ok: false, error: "Failed to write task context" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------------------
 * Project docs (.orca-plan/docs/*.md)
 * ---------------------------------------------------------------------------*/

export type ProjectDoc = { filename: string; content: string };

export async function listDocs(workspaceRoot: string): Promise<ProjectDoc[]> {
  const fn = window.orcaPlan?.listDocs;
  if (!fn) return [];
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true && "docs" in raw) {
      return (raw as unknown as { docs: ProjectDoc[] }).docs;
    }
    return [];
  } catch {
    return [];
  }
}

export async function writeDoc(
  workspaceRoot: string,
  filename: string,
  content: string,
  allDocFilenames: string[],
): Promise<void> {
  const fn = window.orcaPlan?.writeDoc;
  if (!fn) return;
  try {
    await fn(workspaceRoot.trim(), filename, content, allDocFilenames);
  } catch { /* ignore */ }
}

/* ---------------------------------------------------------------------------
 * Read plan.json from disk (for detecting external changes)
 * ---------------------------------------------------------------------------*/

export async function readPlanBackup(
  workspaceRoot: string,
): Promise<{ ok: true; snapshot: PlanProjectSnapshot } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.readPlanBackup;
  if (!fn) return { ok: false, error: "Not available" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true && "snapshot" in raw) {
      return { ok: true, snapshot: (raw as unknown as { snapshot: PlanProjectSnapshot }).snapshot };
    }
    return { ok: false, error: "Failed to read plan backup" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------------------
 * Plan version history
 * ---------------------------------------------------------------------------*/

export type PlanVersionEntry = { filename: string; savedAt: string; source: string };

export async function savePlanVersion(
  workspaceRoot: string,
  source: "ui" | "agent",
  snapshotJson: string,
): Promise<void> {
  const fn = window.orcaPlan?.savePlanVersion;
  if (!fn) return;
  try {
    await fn(workspaceRoot.trim(), source, snapshotJson);
  } catch { /* ignore */ }
}

export async function listPlanVersions(workspaceRoot: string): Promise<PlanVersionEntry[]> {
  const fn = window.orcaPlan?.listPlanVersions;
  if (!fn) return [];
  try {
    const raw: unknown = await fn(workspaceRoot.trim());
    if (
      raw && typeof raw === "object" && "ok" in raw &&
      (raw as { ok: unknown }).ok === true &&
      "versions" in raw && Array.isArray((raw as { versions: unknown }).versions)
    ) {
      return (raw as { versions: PlanVersionEntry[] }).versions;
    }
    return [];
  } catch {
    return [];
  }
}

export async function loadPlanVersion(
  workspaceRoot: string,
  filename: string,
): Promise<{ ok: true; snapshot: unknown; source: string; savedAt: string } | { ok: false; error: string }> {
  const fn = window.orcaPlan?.loadPlanVersion;
  if (!fn) return { ok: false, error: "Not available" };
  try {
    const raw: unknown = await fn(workspaceRoot.trim(), filename);
    if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
      const o = raw as unknown as { snapshot: unknown; source: string; savedAt: string };
      return { ok: true, snapshot: o.snapshot, source: o.source, savedAt: o.savedAt };
    }
    return { ok: false, error: "Failed to load version" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
