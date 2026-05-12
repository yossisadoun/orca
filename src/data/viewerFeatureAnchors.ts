/**
 * Callout positions relative to `.mockTodoCanvas` (minimal todos mock).
 * Only includes features that correspond to something visible in that UI.
 *
 * Mapping:
 * - task-composer → new-todo row (chevron + placeholder)
 * - task-rows → first todo row
 * - focus-filter → footer “All”
 * - focus-show-completed → “Active” / “Completed” chips (planned; same layout)
 */
export const viewerFeatureAnchors: Partial<Record<string, { top: string; left: string }>> = {
  "task-composer": { top: "36%", left: "calc(50% - 198px)" },
  "task-rows": { top: "50%", left: "calc(50% - 200px)" },
  "focus-filter": { top: "82%", left: "calc(50% + 56px)" },
  "focus-show-completed": { top: "82%", left: "calc(50% + 128px)" },
};
