/** User-defined label grouping for plan item chips within a track. */
export interface PlanItemGroup {
  id: string;
  title: string;
}

/** Parallel workstream row on the plan. */
export interface PlanTrack {
  id: string;
  title: string;
  description?: string;
  minimized?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** One tile inside a plan track. */
export interface PlanTrackItem {
  id: string;
  trackId: string;
  label: string;
  description?: string;
  itemGroupId?: string;
  /** Claude Code session ID for this item's conversation. */
  claudeSessionId?: string;
  /** Development order / priority (1 = first to build). */
  devOrder?: number;
  /** Sub-task checklist for this item. */
  checklist?: ChecklistItem[];
  /** Brief note on where work was left off. Set by the agent. */
  lastNote?: string;
  /** ISO timestamp of when lastNote was set. */
  lastNoteAt?: string;
  /** ISO timestamp of last user interaction (chat opened, detail viewed). */
  lastInteractedAt?: string;
  /** Item IDs that must complete before this item can start. */
  blockedBy?: string[];
  /** Item status. */
  status?: "backlog" | "in_progress" | "review" | "done";
}

export interface ReleaseLogEntry {
  id: string;
  label: string;
  /** Linked plan item ID, or undefined for ad-hoc entries. */
  planItemId?: string;
  addedAt: string;
  released: boolean;
  releasedAt?: string;
}

export interface PlanProjectSnapshot {
  v: 1;
  title: string;
  planTracks: PlanTrack[];
  planItemGroups: PlanItemGroup[];
  planTrackItems: PlanTrackItem[];
  releaseLog?: ReleaseLogEntry[];
}

export interface PlanWorkspaceEntry {
  id: string;
  title: string;
  /** Absolute path to the repo / workspace on disk (Electron: set via folder picker or paste). */
  workspaceRoot?: string;
  /** Claude Code session ID for the project-level conversation. */
  claudeSessionId?: string;
  snapshot: PlanProjectSnapshot;
}
