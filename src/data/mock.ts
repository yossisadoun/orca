import type { BoardColumn, Issue } from "../types";

export const columns: BoardColumn[] = [
  { id: "backlog", title: "Backlog", headerVariant: "empty" },
  { id: "todo", title: "Todo", headerVariant: "empty" },
  { id: "in_progress", title: "In Progress", headerVariant: "progress" },
  { id: "human_review", title: "Human Review", headerVariant: "review" },
  { id: "merge", title: "Merge", headerVariant: "merge" },
];

/**
 * Mock backlog for a todo app product: work is **decoupled** (parallel tracks).
 * Feature tiles ~50% shipped — see `defaultFeaturesetItemDefinitions` vs `plannedFeaturesetItemDefinitions`.
 */
export const issues: Issue[] = [
  {
    id: "MT-891",
    title: "Rich text in task notes",
    status: "backlog",
    updatedLabel: "Updated Mar 2",
    variant: "blocked",
    featuresetTagIds: ["task-notes", "task-rows", "lists-sync"],
    description:
      "Markdown-lite or bold/italic in the notes field. Keep storage separate from title for easy iteration.",
    plan: [
      { id: "891a", title: "Define max length + sanitize", done: true, depth: 0 },
      { id: "891b", title: "Editor widget PoC", done: false, depth: 0 },
      { id: "891c", title: "Plain-text fallback", done: false, depth: 1 },
    ],
  },
  {
    id: "MT-888",
    title: "Tag picker and tag chips",
    status: "backlog",
    updatedLabel: "Updated Mar 2",
    featuresetTagIds: ["task-tags", "task-rows", "lists-sidebar"],
    description:
      "Create tags, assign on a task, show chips in the row. No dependency on notes or reorder.",
  },
  {
    id: "MT-886",
    title: "Drag-to-reorder within a list",
    status: "backlog",
    updatedLabel: "Updated Mar 2",
    variant: "highlight",
    featuresetTagIds: ["task-reorder", "task-rows", "focus-filter"],
    description:
      "Persist order per list. Touch + pointer DnD; independent of bulk actions workstream.",
  },
  {
    id: "MT-884",
    title: "Recurring task rules (daily / weekly)",
    status: "backlog",
    updatedLabel: "Updated Mar 2",
    featuresetTagIds: ["power-recurring", "focus-due-dates", "task-rows"],
    description:
      "RRULE-light or presets. Next instance spawns without blocking reminders or export.",
  },
  {
    id: "MT-890",
    title: "Cmd-K command palette",
    status: "todo",
    updatedLabel: "Updated Mar 2",
    featuresetTagIds: ["power-command", "capture-quick-add", "lists-sidebar"],
    description:
      "Jump to list, add task, toggle filter. Registry stays UI-agnostic so engineers can ship in parallel.",
    plan: [
      { id: "890a", title: "Command registry types", done: false, depth: 0 },
      { id: "890b", title: "Fuzzy match UI shell", done: false, depth: 1 },
    ],
  },
  {
    id: "MT-893",
    title: "Hide completed from main list",
    status: "todo",
    updatedLabel: "Updated Mar 6",
    featuresetTagIds: ["focus-show-completed", "focus-filter", "task-rows"],
    description:
      "Setting to collapse done tasks while keeping counts in tabs. Separate from All/Active/Completed filter chips.",
    plan: [
      { id: "893a", title: "Per-list preference key", done: true, depth: 0 },
      { id: "893b", title: "Virtualized list respects flag", done: false, depth: 0 },
    ],
  },
  {
    id: "MT-889",
    title: "Local notification reminders",
    status: "in_progress",
    updatedLabel: "Updated Mar 2",
    agents: ["engineer", "ui_ux_designer"],
    agentWork: {
      engineer: { progress: 62 },
      ui_ux_designer: { progress: 100, complete: true },
    },
    featuresetTagIds: ["reminders-ping", "focus-due-dates", "lists-sync"],
    description:
      "Schedule nudges from due time; permissions UX. Parallels recurring rules but ships on its own timeline.",
    plan: [
      { id: "889a", title: "Notification permission flow", done: true, depth: 0 },
      { id: "889b", title: "Scheduler bridge", done: true, depth: 1 },
      { id: "889c", title: "QA quiet hours overlap", done: false, depth: 0 },
    ],
  },
  {
    id: "MT-885",
    title: "Multi-select bulk complete / delete",
    status: "in_progress",
    updatedLabel: "Updated Mar 2",
    variant: "highlight",
    agents: ["engineer", "product", "qa"],
    agentWork: {
      engineer: { progress: 44 },
      product: { progress: 28 },
      qa: { progress: 71 },
    },
    featuresetTagIds: ["bulk-actions", "task-rows", "archive-soft-delete"],
    description:
      "Checkbox mode + bottom bar actions. Does not block drag-reorder or tags.",
  },
  {
    id: "MT-883",
    title: "Export list to Markdown",
    status: "in_progress",
    updatedLabel: "Updated Mar 2",
    agents: ["ui_ux_designer", "writer", "engineer"],
    agentWork: {
      ui_ux_designer: { progress: 52 },
      writer: { progress: 38, stuck: true },
      engineer: { progress: 18 },
    },
    featuresetTagIds: ["export-list", "capture-share", "task-rows"],
    description:
      "Download one list as .md with checkboxes. Writer blocked on filename + copy; engineering path is decoupled.",
    plan: [
      { id: "883a", title: "Serializer for Markdown", done: false, depth: 0 },
      { id: "883b", title: "Share sheet hook", done: false, depth: 1 },
    ],
  },
  {
    id: "MT-887",
    title: "Archive vs delete semantics",
    status: "human_review",
    updatedLabel: "Updated Mar 2",
    variant: "blocked",
    agents: ["product", "engineer"],
    agentWork: {
      product: { progress: 100, complete: true },
      engineer: { progress: 100, complete: true },
    },
    featuresetTagIds: ["archive-soft-delete", "task-rows", "bulk-actions"],
    description:
      "Soft-archive with 30-day restore; align with bulk delete. Product + legal copy in review.",
    humanAsk: "Approve restore window copy and whether archive hides from sidebar by default.",
  },
  {
    id: "MT-894",
    title: "Empty state for new lists",
    status: "human_review",
    updatedLabel: "Updated Mar 8",
    agents: ["engineer", "writer"],
    agentWork: {
      engineer: { progress: 100, complete: true },
      writer: { progress: 100, complete: true },
    },
    featuresetTagIds: ["task-composer", "task-rows", "capture-quick-add"],
    description:
      "Illustration + CTA when a list has zero tasks. Independent of sync and filters.",
    humanAsk: "Pick final illustration tone (playful vs minimal) for empty list.",
  },
  {
    id: "MT-895",
    title: "Mobile todo row hit targets",
    status: "human_review",
    updatedLabel: "Updated Mar 9",
    variant: "highlight",
    agents: ["engineer", "product"],
    agentWork: {
      engineer: { progress: 100, complete: true },
      product: { progress: 100, complete: true },
    },
    featuresetTagIds: ["task-rows", "task-composer", "focus-filter"],
    description:
      "44px rows, larger checkbox rings on narrow screens. Does not require command palette.",
    humanAsk: "Sign off spacing that pushes filter chips to a second row on phones.",
  },
  {
    id: "MT-896",
    title: "Land JSON export for backups",
    status: "merge",
    updatedLabel: "Updated Mar 10",
    featuresetTagIds: ["export-list", "lists-sync", "task-rows"],
    description:
      "Merge JSON export (per-list download) after CI green. Parallel track to Markdown export.",
  },
];
