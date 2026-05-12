import type { FeaturesetIconKey } from "../data/featureset";
import type { Issue, IssueStatus } from "../types";

export interface AISuggestedFeature {
  label: string;
  description: string;
  iconKey: FeaturesetIconKey;
  groupId: string;
}

function countByStatus(issues: Issue[]): Record<IssueStatus, number> {
  const counts: Record<IssueStatus, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    human_review: 0,
    merge: 0,
  };
  for (const i of issues) counts[i.status]++;
  return counts;
}

function tryAdd(
  list: AISuggestedFeature[],
  suggestion: AISuggestedFeature,
  taken: Set<string>,
  existingLabelsLower: Set<string>,
): void {
  if (list.length >= 3) return;
  const key = suggestion.label.trim().toLowerCase();
  if (!key || existingLabelsLower.has(key) || taken.has(key)) return;
  taken.add(key);
  list.push(suggestion);
}

/**
 * Deterministic “AI-style” suggestions from board state (no network).
 * Picks up to three features that plausibly match counts, blocked work, and load.
 */
export function suggestNextFeatures(
  issues: Issue[],
  existingLabelsLower: Set<string>,
): AISuggestedFeature[] {
  const counts = countByStatus(issues);
  const hasBlocked = issues.some((i) => i.variant === "blocked");
  const out: AISuggestedFeature[] = [];
  const taken = new Set<string>();

  if (counts.human_review > 0) {
    tryAdd(
      out,
      {
        label: "Review inbox for asks",
        description:
          "Single queue of open human-review prompts with snooze and “block duplicate ask” for the same list.",
        iconKey: "inbox",
        groupId: "lists",
      },
      taken,
      existingLabelsLower,
    );
    tryAdd(
      out,
      {
        label: "Inline approve on card",
        description:
          "One-tap approve from the human-review column without opening a modal—keeps parallel tracks moving.",
        iconKey: "checkCircle2",
        groupId: "task-surface",
      },
      taken,
      existingLabelsLower,
    );
  }

  if (counts.in_progress > 1) {
    tryAdd(
      out,
      {
        label: "Per-engineer WIP limit hint",
        description:
          "Soft banner when someone has more than N in-progress tasks—nudges parallelizable work to backlog.",
        iconKey: "layers",
        groupId: "focus",
      },
      taken,
      existingLabelsLower,
    );
  }

  if (counts.backlog >= 3) {
    tryAdd(
      out,
      {
        label: "Backlog by feature area",
        description:
          "Group backlog cards by planned feature id (tags, notes, export) so pods pick decoupled streams.",
        iconKey: "listFilter",
        groupId: "focus",
      },
      taken,
      existingLabelsLower,
    );
  }

  if (hasBlocked) {
    tryAdd(
      out,
      {
        label: "Dependency link on blocked",
        description:
          "Structured “blocked by” URL or issue id on the card—lighter than a full project tool.",
        iconKey: "clipboard",
        groupId: "capture",
      },
      taken,
      existingLabelsLower,
    );
  }

  const fallbacks: AISuggestedFeature[] = [
    {
      label: "Quick-capture inbox list",
      description:
        "Default list for tasks added from quick-add before you sort them—parallel to sidebar lists work.",
      iconKey: "inbox",
      groupId: "lists",
    },
    {
      label: "Subtasks (one level)",
      description:
        "Checklist under a task row; storage separate from main rows so it can ship after tags.",
      iconKey: "checkCircle2",
      groupId: "task-surface",
    },
    {
      label: "Shared list read-only link",
      description:
        "Read-only share for capture-share without edit tokens—good for stakeholder status.",
      iconKey: "link2",
      groupId: "capture",
    },
    {
      label: "Weekly summary email",
      description:
        "Optional digest of completed + overdue counts per list—does not block in-app reminders.",
      iconKey: "mail",
      groupId: "focus",
    },
    {
      label: "Undo toast for deletes",
      description:
        "5s undo after bulk delete or archive—orthogonal to archive semantics review.",
      iconKey: "clock",
      groupId: "task-surface",
    },
  ];

  for (const f of fallbacks) {
    tryAdd(out, f, taken, existingLabelsLower);
    if (out.length >= 3) break;
  }

  return out.slice(0, 3);
}
