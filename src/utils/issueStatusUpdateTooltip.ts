import { agentRoleMeta } from "../data/agentRoles";
import type { Issue, IssueStatus } from "../types";

const STATUS_SHORT: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  human_review: "Human review",
  merge: "Merge",
};

function firstPhrase(text: string, maxLen: number): string {
  const t = text.trim();
  if (!t) return "";
  const stop = t.search(/[.!?]\s/);
  const chunk = stop > 0 ? t.slice(0, stop) : t.split(/\n/)[0] ?? t;
  if (chunk.length <= maxLen) return chunk;
  return `${chunk.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Single-line “ask” from title + description. */
export function issueStatusRequestedLine(issue: Issue): string {
  const title = issue.title.trim();
  if (!issue.description?.trim()) return title;
  const phrase = firstPhrase(issue.description, 100);
  return phrase ? `${title} — ${phrase}` : title;
}

/** Single-line “status now” from column, plan, flags. */
export function issueStatusNowLine(issue: Issue): string {
  const bits: string[] = [STATUS_SHORT[issue.status]];

  if (issue.plan?.length) {
    const done = issue.plan.filter((p) => p.done).length;
    const n = issue.plan.length;
    bits.push(`${done}/${n} checklist`);
    const next = issue.plan.find((p) => !p.done);
    if (next) bits.push(`Next: ${next.title}`);
  }

  if (issue.variant === "blocked") bits.push("blocked");
  if (issue.variant === "highlight") bits.push("highlighted");

  if (issue.status === "in_progress" && issue.agents?.length) {
    const parts = issue.agents.map((r) => {
      const w = issue.agentWork?.[r];
      if (w?.stuck) return `${agentRoleMeta[r].label}: stuck`;
      if (w?.complete) return `${agentRoleMeta[r].label}: done`;
      const pct = w?.progress ?? 0;
      return `${agentRoleMeta[r].label}: ${pct}%`;
    });
    bits.push(parts.join(", "));
  }

  return bits.join(" · ");
}

export function getIssueStatusUpdateTooltip(issue: Issue): {
  requested: string;
  now: string;
} {
  return {
    requested: issueStatusRequestedLine(issue),
    now: issueStatusNowLine(issue),
  };
}
