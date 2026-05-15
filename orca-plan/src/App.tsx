import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanProjectSnapshot, PlanWorkspaceEntry } from "./types";
import { PlanProjectScreen } from "./components/PlanProjectScreen";
import { ProjectsHome } from "./components/ProjectsHome";
import { emptySnapshot, loadWorkspace, nextId, saveWorkspace } from "./utils/persistence";
import { flushPlanBackupsToWorkspaceFolders } from "./utils/folderBackupFlush";

/**
 * When set to a future timestamp, backup flushes are suppressed.
 * Used to prevent overwriting disk changes that we just loaded.
 */
let suppressFlushUntil = 0;
export function suppressBackupFlush(ms = 2000) {
  suppressFlushUntil = Date.now() + ms;
}

export default function App() {
  const [projects, setProjects] = useState<PlanWorkspaceEntry[]>([]);
  const projectsRef = useRef<PlanWorkspaceEntry[]>([]);
  projectsRef.current = projects;
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWorkspace().then(({ projects: loaded, lastId }) => {
      if (cancelled) return;
      setProjects(loaded);
      setActiveProjectId(lastId && loaded.some((p) => p.id === lastId) ? lastId : null);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspace(projects, activeProjectId);
  }, [hydrated, projects, activeProjectId]);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => {
      if (Date.now() < suppressFlushUntil) return;
      void flushPlanBackupsToWorkspaceFolders(projectsRef.current);
    }, 1500);
    return () => window.clearTimeout(id);
  }, [hydrated, projects]);

  useEffect(() => {
    if (!hydrated) return;
    const onVis = () => {
      if (document.visibilityState === "hidden" && Date.now() >= suppressFlushUntil) {
        void flushPlanBackupsToWorkspaceFolders(projectsRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hydrated]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const reorderProjects = useCallback((orderedIds: string[]) => {
    setProjects((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      const next: PlanWorkspaceEntry[] = [];
      for (const id of orderedIds) {
        const p = byId.get(id);
        if (p) next.push(p);
      }
      for (const p of prev) {
        if (!orderedIds.includes(p.id)) next.push(p);
      }
      return next;
    });
  }, []);

  const onNewProject = useCallback(() => {
    const id = nextId("proj");
    const title = "Untitled project";
    const entry: PlanWorkspaceEntry = {
      id,
      title,
      snapshot: emptySnapshot(title),
    };
    setProjects((p) => [...p, entry]);
    setDraftProjectId(id);
  }, []);

  const onOpenProject = useCallback((id: string, title?: string) => {
    if (title != null) {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, title: title.trim() || p.title, snapshot: { ...p.snapshot, title: title.trim() || p.snapshot.title } } : p)),
      );
    }
    setActiveProjectId(id);
    setDraftProjectId((d) => (d === id ? null : d));
  }, []);

  const onBack = useCallback(() => {
    setActiveProjectId(null);
  }, []);

  const onUpdateProjectTitle = useCallback((id: string, title: string) => {
    const t = title.trim() || "Untitled project";
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, title: t, snapshot: { ...p.snapshot, title: t } } : p,
      ),
    );
  }, []);

  const onUpdateWorkspaceRoot = useCallback((id: string, workspaceRoot: string | undefined) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, workspaceRoot } : p)),
    );
  }, []);

  const onDeleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDraftProjectId((d) => (d === id ? null : d));
    setActiveProjectId((cur) => (cur === id ? null : cur));
  }, []);

  const onImportProjects = useCallback((imported: PlanWorkspaceEntry[]) => {
    if (!imported.length) return;
    setProjects((prev) => {
      const next: PlanWorkspaceEntry[] = [];
      for (const p of prev) {
        const repl = imported.find((i) => i.id === p.id);
        next.push(repl ?? p);
      }
      for (const p of imported) {
        if (!prev.some((x) => x.id === p.id)) {
          next.push(p);
        }
      }
      return next;
    });
  }, []);

  if (!hydrated) {
    return null;
  }

  if (activeProject) {
    return (
      <PlanProjectScreen
        project={activeProject}
        onBack={onBack}
        onUpdateSnapshot={(snapshot: PlanProjectSnapshot) => {
          setProjects((prev) =>
            prev.map((p) => (p.id === activeProject.id ? { ...p, snapshot } : p)),
          );
        }}
        onRenameProject={(title) => {
          onUpdateProjectTitle(activeProject.id, title);
        }}
        onUpdateGitHub={(github) => {
          setProjects((prev) =>
            prev.map((p) => (p.id === activeProject.id ? { ...p, github } : p)),
          );
        }}
      />
    );
  }

  return (
    <ProjectsHome
      projects={projects}
      draftProjectId={draftProjectId}
      onOpenProject={onOpenProject}
      onNewProject={onNewProject}
      onUpdateProjectTitle={onUpdateProjectTitle}
      onUpdateWorkspaceRoot={onUpdateWorkspaceRoot}
      reorderProjects={reorderProjects}
      onDeleteProject={onDeleteProject}
      onImportProjects={onImportProjects}
    />
  );
}
