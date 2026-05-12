import { issues } from "./mock";
import {
  createExtendingProjectSnapshot,
  createNewProjectSnapshot,
  persistProjectScreenState,
  type ProjectScreenPersistedSnapshot,
} from "../utils/projectScreenPersistence";

export type ProjectDemoScenarioId = "extending_project" | "new_project";

export const PROJECT_DEMO_SCENARIO_MENU: {
  id: ProjectDemoScenarioId;
  label: string;
  /** Omitted when the item opens an in-app flow instead of confirm+reload. */
  confirmMessage?: string;
}[] = [
  {
    id: "extending_project",
    label: "Extending a project",
    confirmMessage:
      "Reset the demo to “Extending a project”? The bundled board and Features catalog will be restored and the page will reload.",
  },
  {
    id: "new_project",
    label: "New project",
  },
];

export function getProjectDemoScenarioSnapshot(id: ProjectDemoScenarioId): ProjectScreenPersistedSnapshot {
  switch (id) {
    case "new_project":
      return createNewProjectSnapshot();
    case "extending_project":
    default:
      return createExtendingProjectSnapshot(issues);
  }
}

/** Persist scenario snapshot and reload so all UI resets cleanly. */
export function resetToProjectDemoScenario(id: ProjectDemoScenarioId): void {
  if (typeof window === "undefined") return;
  persistProjectScreenState(getProjectDemoScenarioSnapshot(id));
  window.location.reload();
}
