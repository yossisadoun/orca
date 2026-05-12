import { FileText } from "lucide-react";
import type { FeaturesetItem } from "../data/featureset";
import type { AgentRoleId, Issue } from "../types";

const STUCK_BOT_DEFAULT_HUMAN_ASK =
  "A bot is stuck on this task — tap the highlighted agent to unblock.";

function firstStuckAgentRoles(issue: Issue): AgentRoleId[] {
  if (!issue.agents?.length) return [];
  const aw = issue.agentWork;
  if (!aw) return [];
  return issue.agents.filter((role) => Boolean(aw[role]?.stuck));
}

/** Short, actionable line for who is stuck and what the human should do (no humanAsk). */
function stuckNeedShortLine(role: AgentRoleId, issueTitle: string): string {
  const t = issueTitle.trim() || "this task";
  switch (role) {
    case "writer":
      return `Confirm filenames and voice for “${t}”.`;
    case "engineer":
      return `Lock the API or data contract for “${t}”.`;
    case "ui_ux_designer":
      return `Pick the layout direction for “${t}”.`;
    case "product":
      return `Resolve scope priority on “${t}”.`;
    case "qa":
      return `Sign off expected edge cases for “${t}”.`;
    default:
      return `Tap the stuck agent on “${t}” to unblock.`;
  }
}

/** Any listed agent has `stuck` (in-progress cards awaiting unblock). */
export function issueHasStuckAgent(issue: Issue): boolean {
  return firstStuckAgentRoles(issue).length > 0;
}

/**
 * Copy for the yellow “Need from you” banner on stuck in-progress cards.
 * Uses custom `humanAsk` when set; otherwise a short, role-specific ask (first stuck agent).
 */
export function issueStuckNeedsFromYouText(issue: Issue): string {
  const custom = issue.humanAsk?.trim();
  if (custom) return custom;
  const stuck = firstStuckAgentRoles(issue);
  const first = stuck[0];
  if (!first) return STUCK_BOT_DEFAULT_HUMAN_ASK;
  let line = stuckNeedShortLine(first, issue.title);
  if (stuck.length > 1) {
    line += ` (${stuck.length - 1} more stuck—tap each agent.)`;
  }
  return line;
}

/**
 * Same as banner copy but for a specific stuck agent row (e.g. inbox).
 * When `humanAsk` is set on the issue, it still wins so messaging stays consistent.
 */
export function issueStuckNeedsForAgent(issue: Issue, role: AgentRoleId): string {
  const custom = issue.humanAsk?.trim();
  if (custom) return custom;
  return stuckNeedShortLine(role, issue.title);
}

const BOT_POOL: AgentRoleId[] = [
  "engineer",
  "product",
  "qa",
  "writer",
  "ui_ux_designer",
];

/** Deterministic 2–3 bots from issue id / title length (demo). */
export function assignBotsForTodoIssue(issue: Issue): Pick<Issue, "agents" | "agentWork"> {
  const seed = issue.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + issue.title.length;
  const nWant = 2 + (seed % 2);
  const start = seed % BOT_POOL.length;
  const agents: AgentRoleId[] = [];
  for (let step = 0; step < BOT_POOL.length && agents.length < nWant; step++) {
    const r = BOT_POOL[(start + step) % BOT_POOL.length]!;
    if (!agents.includes(r)) agents.push(r);
  }
  const agentWork: NonNullable<Issue["agentWork"]> = {};
  for (const role of agents) {
    agentWork[role] = { progress: 0 };
  }
  return { agents, agentWork };
}

/** Backlog → Todo (or Specify): assign bots and schedule pickup → In progress after `pickupDelayMs`. */
export function issueEnteringTodoWithBots(
  issue: Issue,
  now: number = Date.now(),
  pickupDelayMs: number = 2_000,
): Issue {
  const { agents, agentWork } = assignBotsForTodoIssue(issue);
  return {
    ...issue,
    status: "todo",
    agents,
    agentWork,
    todoBotPickupAt: now + pickupDelayMs,
    updatedLabel: formatIssueUpdatedLabel(new Date(now)),
  };
}

/** Map a board issue to a synthetic Features-catalog-shaped subject for the spec chat modal. */
export function issueToSpecChatFeaturesetItem(
  issue: Issue,
  catalogItems: FeaturesetItem[],
): FeaturesetItem {
  const tagId = issue.featuresetTagIds?.[0];
  const linked = tagId ? catalogItems.find((i) => i.id === tagId) : undefined;
  const description =
    issue.description?.trim() ||
    linked?.description ||
    "No description yet. Use this chat to nail down intent, constraints, and acceptance criteria.";
  return {
    id: `__specify__${issue.id}`,
    groupId: linked?.groupId ?? "task-surface",
    label: issue.title,
    description,
    icon: linked?.icon ?? FileText,
  };
}

/** Next MT-### id after the highest in the list. */
export function nextIssueId(existing: Issue[]): string {
  let max = 0;
  for (const issue of existing) {
    const m = /^MT-(\d+)$/.exec(issue.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MT-${max + 1}`;
}

/** Short label like mock data ("Updated Mar 2"). */
export function formatIssueUpdatedLabel(d: Date = new Date()): string {
  return `Updated ${d.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
}
