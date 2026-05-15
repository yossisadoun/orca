import type { PlanProjectSnapshot, PlanWorkspaceEntry } from "../types";
import {
  canLoadWorkspaceFromDisk,
  canSaveWorkspaceToDisk,
  loadWorkspaceFromDisk,
  saveWorkspaceToDisk,
} from "../orcaPlanHost";

const STORAGE_KEY = "orca-plan.workspace.v1";

/* ---------------------------------------------------------------------------
 * localStorage (browser fallback)
 * ---------------------------------------------------------------------------*/

function loadFromLocalStorage(): { projects: PlanWorkspaceEntry[]; lastId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { projects: [], lastId: null };
    const data = JSON.parse(raw) as {
      projects?: PlanWorkspaceEntry[];
      lastActiveProjectId?: string | null;
    };
    return {
      projects: Array.isArray(data.projects) ? data.projects : [],
      lastId: data.lastActiveProjectId ?? null,
    };
  } catch {
    return { projects: [], lastId: null };
  }
}

function saveToLocalStorage(projects: PlanWorkspaceEntry[], lastActiveProjectId: string | null) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ v: 1, projects, lastActiveProjectId }, null, 0),
  );
}

/* ---------------------------------------------------------------------------
 * Public API — disk-primary in Electron, localStorage fallback in browser
 * ---------------------------------------------------------------------------*/

/**
 * Load workspace: tries disk first (Electron), falls back to localStorage.
 * Async because disk read goes through IPC.
 */
export async function loadWorkspace(): Promise<{ projects: PlanWorkspaceEntry[]; lastId: string | null }> {
  if (canLoadWorkspaceFromDisk()) {
    const result = await loadWorkspaceFromDisk();
    if (result.ok) {
      return { projects: result.projects, lastId: result.lastActiveProjectId };
    }
    console.warn("[orca-plan] Disk load failed, falling back to localStorage:", result.error);
  }
  return loadFromLocalStorage();
}

/**
 * Save workspace: writes to disk (Electron) AND localStorage (both).
 * localStorage is kept in sync as a fast cache / browser fallback.
 */
export function saveWorkspace(projects: PlanWorkspaceEntry[], lastActiveProjectId: string | null) {
  // Always write localStorage for fast reads and browser fallback
  saveToLocalStorage(projects, lastActiveProjectId);

  // Also write to disk if available (fire and forget)
  if (canSaveWorkspaceToDisk()) {
    void saveWorkspaceToDisk(projects, lastActiveProjectId).catch((err) => {
      console.warn("[orca-plan] Disk save failed:", err);
    });
  }
}

/* ---------------------------------------------------------------------------
 * Utilities (unchanged)
 * ---------------------------------------------------------------------------*/

export function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptySnapshot(title: string): PlanProjectSnapshot {
  const t = title.trim() || "Untitled";
  return {
    v: 1,
    title: t,
    planTracks: [],
    planItemGroups: [],
    planTrackItems: [],
  };
}
