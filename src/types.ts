export type IssueStatus = "backlog" | "todo" | "in_progress" | "human_review" | "merge";

export type IssueCardVariant = "default" | "blocked" | "highlight";

/** Collaborator types shown on In Progress cards (e.g. agents). */
export type AgentRoleId =
  | "ui_ux_designer"
  | "engineer"
  | "product"
  | "qa"
  | "writer";

/** Per-agent run state on In Progress cards (progress ring, done, or stuck). */
export interface AgentWorkState {
  /** 0–100 while working */
  progress: number;
  /** Finished successfully — green check */
  complete?: boolean;
  /** Failed/blocked — red X; card is promoted to Human Review */
  stuck?: boolean;
}

/** One row in the issue Plan checklist (`depth` 0 = major item, 1 = nested). */
export interface IssuePlanItem {
  id: string;
  title: string;
  done: boolean;
  depth: number;
}

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  updatedLabel: string;
  variant?: IssueCardVariant;
  /** Who is actively working on this (shown in the In Progress column). */
  agents?: AgentRoleId[];
  /** Optional per-agent progress / complete / stuck (drives bot ring UI on in-progress cards). */
  agentWork?: Partial<Record<AgentRoleId, AgentWorkState>>;
  /** Issue detail body (shown in the issue popup). */
  description?: string;
  /** Hierarchical plan / sub-tasks with completion status. */
  plan?: IssuePlanItem[];
  /**
   * When status is human review: one line on what we need from a human
   * (e.g. approve copy, unblock a decision). Shown prominently on the card.
   */
  humanAsk?: string;
  /**
   * Features catalog definition ids (item `id` from `featureset` data) shown as icons on the card.
   * When omitted, tags are inferred from title/description/humanAsk against the catalog.
   */
  featuresetTagIds?: string[];
  /**
   * When set, bots assigned in Todo auto-move this issue to In progress after this time (demo).
   * Cleared when pausing to Todo or after promotion.
   */
  todoBotPickupAt?: number;
}

export interface BoardColumn {
  id: IssueStatus;
  title: string;
  /** Visual style for column header icon */
  headerVariant: "empty" | "progress" | "review" | "merge";
}
