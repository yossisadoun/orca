import { agentRoleMeta } from "../data/agentRoles";
import type { AgentRoleId, Issue } from "../types";
import { issueHasStuckAgent, issueStuckNeedsForAgent } from "./issueUtils";

export type AttentionReason = "human_review" | "stuck" | "merge";

export interface AttentionThread {
  /** Unique row id (issue may appear multiple times for different stuck agents). */
  threadKey: string;
  issue: Issue;
  reason: AttentionReason;
  headline: string;
  preview: string;
  /** Agent whose voice / avatar we use in the Inbox chat panel. */
  panelAgentRoleId: AgentRoleId;
}

/** One ticket in the inbox with one or more attention threads (e.g. several stuck agents). */
export interface AttentionTicketGroup {
  issue: Issue;
  threads: AttentionThread[];
}

const REASON_ORDER: AttentionReason[] = ["human_review", "stuck", "merge"];

const ROLE_ORDER: AgentRoleId[] = [
  "engineer",
  "product",
  "qa",
  "writer",
  "ui_ux_designer",
];

function roleSortIndex(role: AgentRoleId): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? 99 : i;
}

function panelAgentForHumanReview(issue: Issue): AgentRoleId {
  const agents = issue.agents;
  if (agents?.length) return agents[agents.length - 1]!;
  return "product";
}

function stuckPreviewWithContext(issue: Issue, role: AgentRoleId): string {
  const detail = issueStuckNeedsForAgent(issue, role);
  return `“${issue.title}” · ${agentRoleMeta[role].label} — ${detail}`;
}

/** Flat list of threads (human review: one per ticket; stuck: one per stuck agent; merge: one per ticket). */
export function buildAttentionThreads(issues: Issue[]): AttentionThread[] {
  const out: AttentionThread[] = [];
  for (const issue of issues) {
    if (issue.status === "human_review") {
      const preview =
        issue.humanAsk?.trim() ||
        issue.description?.trim() ||
        "Waiting on your review or approval.";
      out.push({
        threadKey: `${issue.id}:human_review`,
        issue,
        reason: "human_review",
        headline: "Human review",
        preview,
        panelAgentRoleId: panelAgentForHumanReview(issue),
      });
      continue;
    }
    if (issue.status === "in_progress" && issueHasStuckAgent(issue)) {
      const aw = issue.agentWork;
      for (const role of issue.agents ?? []) {
        if (!aw?.[role]?.stuck) continue;
        out.push({
          threadKey: `${issue.id}:stuck:${role}`,
          issue,
          reason: "stuck",
          headline: `${agentRoleMeta[role].label} stuck`,
          preview: stuckPreviewWithContext(issue, role),
          panelAgentRoleId: role,
        });
      }
      continue;
    }
    if (issue.status === "merge") {
      out.push({
        threadKey: `${issue.id}:merge`,
        issue,
        reason: "merge",
        headline: "Merging",
        preview: "Landing work into Features — watch the merge lane on the board.",
        panelAgentRoleId: "engineer",
      });
    }
  }
  return out.sort((a, b) => {
    const dr = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
    if (dr !== 0) return dr;
    const dt = a.issue.title.localeCompare(b.issue.title);
    if (dt !== 0) return dt;
    return roleSortIndex(a.panelAgentRoleId) - roleSortIndex(b.panelAgentRoleId);
  });
}

function compareGroups(a: AttentionTicketGroup, b: AttentionTicketGroup): number {
  const minReason = (ts: AttentionThread[]) =>
    Math.min(...ts.map((t) => REASON_ORDER.indexOf(t.reason)));
  const d = minReason(a.threads) - minReason(b.threads);
  if (d !== 0) return d;
  return a.issue.title.localeCompare(b.issue.title);
}

function sortThreadsInGroup(threads: AttentionThread[]): AttentionThread[] {
  return [...threads].sort((a, b) => {
    const dr = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
    if (dr !== 0) return dr;
    return roleSortIndex(a.panelAgentRoleId) - roleSortIndex(b.panelAgentRoleId);
  });
}

/** Group flat threads by ticket for the inbox list. */
export function groupAttentionThreads(threads: AttentionThread[]): AttentionTicketGroup[] {
  const byId = new Map<string, AttentionThread[]>();
  for (const t of threads) {
    const arr = byId.get(t.issue.id);
    if (arr) arr.push(t);
    else byId.set(t.issue.id, [t]);
  }
  const groups: AttentionTicketGroup[] = [];
  for (const groupThreads of byId.values()) {
    const sorted = sortThreadsInGroup(groupThreads);
    groups.push({ issue: sorted[0]!.issue, threads: sorted });
  }
  return groups.sort(compareGroups);
}
