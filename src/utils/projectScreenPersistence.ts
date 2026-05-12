import {
  defaultFeaturesetItemDefinitions,
  featuresetIcons,
  type FeaturesetGroup,
  type FeaturesetItemDefinition,
} from "../data/featureset";
import type { AgentRoleId, AgentWorkState, Issue, IssueStatus } from "../types";

const AGENT_ROLE_IDS: AgentRoleId[] = [
  "ui_ux_designer",
  "engineer",
  "product",
  "qa",
  "writer",
];

const STORAGE_KEY = "orca.projectScreen.v1";

const ISSUE_STATUSES: IssueStatus[] = ["backlog", "todo", "in_progress", "human_review", "merge"];

export type ViewTabPersisted = "control-center" | "inbox" | "viewer";

export type FeatureTileColorPersisted = "white" | "red" | "yellow" | "green";

export interface ProjectScreenPersistedSnapshot {
  boardIssues: Issue[];
  snoozedUntilById: Record<string, number>;
  viewTab: ViewTabPersisted;
  customGroups: FeaturesetGroup[];
  customItemDefs: FeaturesetItemDefinition[];
  featureTileColors: Partial<Record<string, FeatureTileColorPersisted>>;
  viewerBranch: string;
  /** When true, default shipped/planned Features rows are hidden until the user adds tiles. */
  hideDefaultFeaturesetCatalog: boolean;
}

interface StoredV1 {
  v: 1;
  boardIssues?: unknown;
  snoozedUntilById?: unknown;
  viewTab?: unknown;
  customGroups?: unknown;
  customItemDefs?: unknown;
  featureTileColors?: unknown;
  viewerBranch?: unknown;
  hideDefaultFeaturesetCatalog?: unknown;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function parseAgentWork(raw: unknown): Issue["agentWork"] {
  if (!isRecord(raw)) return undefined;
  const out: Partial<Record<AgentRoleId, AgentWorkState>> = {};
  for (const key of AGENT_ROLE_IDS) {
    const v = raw[key];
    if (!isRecord(v)) continue;
    const p = v.progress;
    const progress =
      typeof p === "number" && Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
    const w: AgentWorkState = { progress };
    if (v.complete === true) w.complete = true;
    if (v.stuck === true) w.stuck = true;
    out[key] = w;
  }
  return Object.keys(out).length ? out : undefined;
}

function isIssue(x: unknown): x is Issue {
  if (!isRecord(x)) return false;
  const id = x.id;
  const title = x.title;
  const status = x.status;
  if (typeof id !== "string" || typeof title !== "string" || typeof status !== "string") return false;
  if (!ISSUE_STATUSES.includes(status as IssueStatus)) return false;
  return true;
}

function parseIssuesList(raw: unknown[]): Issue[] {
  const out: Issue[] = [];
  for (const row of raw) {
    if (!isIssue(row)) continue;
    const tagRaw = row.featuresetTagIds;
    const featuresetTagIds = Array.isArray(tagRaw)
      ? tagRaw.filter((x): x is string => typeof x === "string")
      : undefined;
    out.push({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedLabel: typeof row.updatedLabel === "string" ? row.updatedLabel : "",
      variant: row.variant === "blocked" || row.variant === "highlight" ? row.variant : undefined,
      agents: Array.isArray(row.agents) ? (row.agents as Issue["agents"]) : undefined,
      agentWork: parseAgentWork(row.agentWork),
      description: typeof row.description === "string" ? row.description : undefined,
      plan: Array.isArray(row.plan) ? (row.plan as Issue["plan"]) : undefined,
      humanAsk: typeof row.humanAsk === "string" ? row.humanAsk : undefined,
      featuresetTagIds: featuresetTagIds?.length ? featuresetTagIds : undefined,
      todoBotPickupAt:
        typeof row.todoBotPickupAt === "number" && Number.isFinite(row.todoBotPickupAt)
          ? row.todoBotPickupAt
          : undefined,
    });
  }
  return out;
}

function parseSnoozes(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function parseViewTab(raw: unknown): ViewTabPersisted | null {
  if (raw === "control-center" || raw === "inbox" || raw === "viewer") return raw;
  return null;
}

function parseFeatureTileColors(raw: unknown): Partial<Record<string, FeatureTileColorPersisted>> | null {
  if (!isRecord(raw)) return null;
  const allowed: FeatureTileColorPersisted[] = ["white", "red", "yellow", "green"];
  const out: Partial<Record<string, FeatureTileColorPersisted>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.includes(v as FeatureTileColorPersisted)) out[k] = v as FeatureTileColorPersisted;
  }
  return out;
}

function parseCustomGroups(raw: unknown): FeaturesetGroup[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FeaturesetGroup[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const title = row.title;
    if (typeof id !== "string" || typeof title !== "string") continue;
    const hint = row.hint;
    out.push({ id, title, hint: typeof hint === "string" ? hint : undefined });
  }
  return out;
}

function parseCustomItemDefs(raw: unknown): FeaturesetItemDefinition[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FeaturesetItemDefinition[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const groupId = row.groupId;
    const label = row.label;
    const description = row.description;
    const iconKey = row.iconKey;
    if (
      typeof id !== "string" ||
      typeof groupId !== "string" ||
      typeof label !== "string" ||
      typeof description !== "string" ||
      typeof iconKey !== "string"
    ) {
      continue;
    }
    if (!(iconKey in featuresetIcons)) continue;
    out.push({
      id,
      groupId,
      label,
      description,
      iconKey: iconKey as FeaturesetItemDefinition["iconKey"],
    });
  }
  return out;
}

export function pruneExpiredSnoozes(map: Record<string, number>): Record<string, number> {
  const now = Date.now();
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v > now) next[k] = v;
  }
  return next;
}

function defaultShippedFeatureTileColors(): Partial<Record<string, FeatureTileColorPersisted>> {
  const out: Partial<Record<string, FeatureTileColorPersisted>> = {};
  for (const d of defaultFeaturesetItemDefinitions) {
    out[d.id] = "green";
  }
  return out;
}

/** Bundled “Extending a project” demo: full seeded board from mock issues. */
export function createExtendingProjectSnapshot(seedIssues: Issue[]): ProjectScreenPersistedSnapshot {
  return {
    boardIssues: [...seedIssues],
    snoozedUntilById: {},
    viewTab: "control-center",
    customGroups: [],
    customItemDefs: [],
    featureTileColors: defaultShippedFeatureTileColors(),
    viewerBranch: "main",
    hideDefaultFeaturesetCatalog: false,
  };
}

/** “New project” scenario: empty board, empty Features grid until user adds tiles. */
export function createNewProjectSnapshot(): ProjectScreenPersistedSnapshot {
  return {
    boardIssues: [],
    snoozedUntilById: {},
    viewTab: "control-center",
    customGroups: [],
    customItemDefs: [],
    featureTileColors: {},
    viewerBranch: "main",
    hideDefaultFeaturesetCatalog: true,
  };
}

function defaults(defaultIssues: Issue[]): ProjectScreenPersistedSnapshot {
  return createExtendingProjectSnapshot(defaultIssues);
}

/** One-time read for initial React state (browser only). */
export function getProjectScreenInitialState(seedIssues: Issue[]): ProjectScreenPersistedSnapshot {
  const base = defaults(seedIssues);
  if (typeof window === "undefined") return base;
  try {
    const rawJson = localStorage.getItem(STORAGE_KEY);
    if (!rawJson) return base;
    const data = JSON.parse(rawJson) as unknown;
    if (!isRecord(data) || data.v !== 1) return base;
    const row = data as unknown as StoredV1;
    const boardIssues =
      Array.isArray(row.boardIssues) ? parseIssuesList(row.boardIssues) : base.boardIssues;
    const snoozedRaw = parseSnoozes(row.snoozedUntilById) ?? {};
    const snoozedUntilById = pruneExpiredSnoozes(snoozedRaw);
    const viewTab = parseViewTab(row.viewTab) ?? base.viewTab;
    const customGroups = parseCustomGroups(row.customGroups) ?? [];
    const customItemDefs = parseCustomItemDefs(row.customItemDefs) ?? [];
    const hideDefaultFeaturesetCatalog =
      typeof row.hideDefaultFeaturesetCatalog === "boolean"
        ? row.hideDefaultFeaturesetCatalog
        : base.hideDefaultFeaturesetCatalog;
    const parsedTileColors = parseFeatureTileColors(row.featureTileColors) ?? {};
    const featureTileColors = hideDefaultFeaturesetCatalog
      ? { ...parsedTileColors }
      : {
          ...defaultShippedFeatureTileColors(),
          ...parsedTileColors,
        };
    const viewerBranch = typeof row.viewerBranch === "string" ? row.viewerBranch : base.viewerBranch;
    return {
      boardIssues,
      snoozedUntilById,
      viewTab,
      customGroups,
      customItemDefs,
      featureTileColors,
      viewerBranch,
      hideDefaultFeaturesetCatalog,
    };
  } catch {
    return base;
  }
}

export function persistProjectScreenState(snapshot: ProjectScreenPersistedSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredV1 = {
      v: 1,
      boardIssues: snapshot.boardIssues,
      snoozedUntilById: pruneExpiredSnoozes(snapshot.snoozedUntilById),
      viewTab: snapshot.viewTab,
      customGroups: snapshot.customGroups,
      customItemDefs: snapshot.customItemDefs,
      featureTileColors: snapshot.featureTileColors,
      viewerBranch: snapshot.viewerBranch,
      hideDefaultFeaturesetCatalog: snapshot.hideDefaultFeaturesetCatalog,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Clears `localStorage`; next page load uses seed data from `getProjectScreenInitialState`. */
export function clearPersistedProjectScreen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
