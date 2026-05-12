import type { FeaturesetIconKey } from "./featureset";

/** One parallel workstream: ordered for planning; each row can ship independently behind a thin contract. */
export interface NewTodoPlanRow {
  /** 1-based dev order */
  ordinal: number;
  groupId: string;
  label: string;
  description: string;
  iconKey: FeaturesetIconKey;
}

const rows: Omit<NewTodoPlanRow, "ordinal">[] = [
  {
    groupId: "lists",
    label: "List shell & navigation",
    description:
      "Multiple lists, switcher, create/rename, default list, and empty states — owns list identity only.",
    iconKey: "layoutTemplate",
  },
  {
    groupId: "capture",
    label: "Quick capture & inbox",
    description:
      "Fast add to an inbox without picking a list first; promote into a target list later.",
    iconKey: "inbox",
  },
  {
    groupId: "task-surface",
    label: "Task rows & completion",
    description:
      "Row model: checkbox, title, reorder, archive pattern — no scheduling UI yet.",
    iconKey: "checkCircle2",
  },
  {
    groupId: "task-surface",
    label: "Composer & inline add",
    description:
      "Bottom or top composer, Enter to add, basic validation — pairs with row model APIs.",
    iconKey: "plus",
  },
  {
    groupId: "task-surface",
    label: "Task notes",
    description:
      "Optional detail surface: longer notes per task, separate from title.",
    iconKey: "fileText",
  },
  {
    groupId: "focus",
    label: "Due dates & reminders",
    description:
      "Date on task, sort by due, light reminder hooks — doesn't own filtering UI.",
    iconKey: "calendar",
  },
  {
    groupId: "focus",
    label: "Filters & focus views",
    description:
      "Today / Active / Completed toggles, saved segments — consumes due + completion state.",
    iconKey: "listFilter",
  },
  {
    groupId: "capture",
    label: "Share read-only link",
    description:
      "Generate a link for a list or project snapshot; optional stub for collaboration.",
    iconKey: "link2",
  },
];

/** Default parallel-friendly roadmap for a new todo app (local demo — not an LLM). */
export function getDefaultParallelTodoPlan(): NewTodoPlanRow[] {
  return rows.map((r, i) => ({ ...r, ordinal: i + 1 }));
}
