import type { AgentRoleId } from "../types";
import type { AttentionReason } from "./attentionThreads";

export function openingStuckMessage(roleId: AgentRoleId, issueTitle: string): string {
  const title = issueTitle.trim() || "this task";
  switch (roleId) {
    case "writer":
      return `I’m blocked on copy for “${title}”—need a product call on filenames and one line of voice before I can ship.`;
    case "engineer":
      return `Can’t merge my slice for “${title}” until the API contract for export is nailed—don’t want to ship the wrong shape.`;
    case "ui_ux_designer":
      return `Stuck on “${title}”: two valid layout patterns—need a quick decision so I don’t thrash the handoff.`;
    case "product":
      return `Waiting on scope for “${title}”—two priorities conflict and I don’t want to unblock the wrong team.`;
    case "qa":
      return `Blocked verifying “${title}”—need the expected edge-case list signed off so I’m not rubber-stamping.`;
    default:
      return `I’m stuck on “${title}”—need a bit of direction before I can continue.`;
  }
}

export function openingHumanReviewMessage(roleId: AgentRoleId, issueTitle: string): string {
  const title = issueTitle.trim() || "this task";
  switch (roleId) {
    case "engineer":
      return `My changes for “${title}” are ready—I need your review or a quick “ship it” so we can move on.`;
    case "qa":
      return `I’ve finished verification on “${title}”—need you to accept the risk call on the last edge cases.`;
    case "product":
      return `“${title}” is at a decision point—need you to pick the path so the rest of the team isn’t blocked.`;
    case "writer":
      return `Draft for “${title}” is in—need sign-off on tone and the couple of open wording choices.`;
    case "ui_ux_designer":
      return `Handoff for “${title}” is ready—need your eyes on the final layout notes before we call it done.`;
    default:
      return `We’re ready for your review on “${title}”—let me know if anything needs another pass.`;
  }
}

export function openingMergeMessage(issueTitle: string): string {
  const title = issueTitle.trim() || "this task";
  return `Landing “${title}” into Features now—I’ll ping here if anything unexpected shows up in the merge lane.`;
}

/** Short line for the top of the inbox chat (mirrors list preview). */
export function compactStatusForInboxChat(
  reason: AttentionReason,
  preview: string,
  issueTitle: string,
): string {
  const p = preview.trim();
  if (p) return p;
  const t = issueTitle.trim() || "This issue";
  switch (reason) {
    case "human_review":
      return `${t} — waiting on your review.`;
    case "stuck":
      return `${t} — agent needs input.`;
    case "merge":
      return `${t} — merging into Features.`;
    default:
      return t;
  }
}
