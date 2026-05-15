import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import type { PlanWorkspaceEntry } from "../types";
import { canPickImportPlanBackups, canPickWorkspaceFolder, canSaveWorkspaceToDisk, pickImportPlanBackups, pickWorkspaceFolder } from "../orcaPlanHost";
import styles from "./ProjectsHome.module.css";

function summarize(entry: PlanWorkspaceEntry): { primary: string; secondary: string } {
  const { planTracks, planTrackItems } = entry.snapshot;
  const nTracks = planTracks.length;
  const nItems = planTrackItems.length;
  return {
    primary: `${nItems} plan items`,
    secondary: `${nTracks} track${nTracks === 1 ? "" : "s"}`,
  };
}

function truncatePath(fsPath: string, maxChars: number) {
  const t = fsPath.trim();
  if (t.length <= maxChars) return t;
  return `…${t.slice(-(maxChars - 1))}`;
}

function reorderByIndex<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

export function ProjectsHome({
  projects,
  draftProjectId,
  onOpenProject,
  onNewProject,
  onUpdateProjectTitle,
  onUpdateWorkspaceRoot,
  reorderProjects,
  onDeleteProject,
  onImportProjects,
}: {
  projects: PlanWorkspaceEntry[];
  draftProjectId: string | null;
  onOpenProject: (id: string, title?: string) => void;
  onNewProject: () => void;
  onUpdateProjectTitle: (id: string, title: string) => void;
  onUpdateWorkspaceRoot: (id: string, workspaceRoot: string | undefined) => void;
  reorderProjects: (orderedIds: string[]) => void;
  onDeleteProject: (id: string) => void;
  onImportProjects: (projects: PlanWorkspaceEntry[]) => void;
}) {
  const orderedProjects = useMemo(() => {
    if (!draftProjectId) return projects;
    const d = projects.find((p) => p.id === draftProjectId);
    const rest = projects.filter((p) => p.id !== draftProjectId);
    return d ? [d, ...rest] : projects;
  }, [projects, draftProjectId]);

  const draftCardRef = useRef<HTMLDivElement | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftWorkspaceRoot, setDraftWorkspaceRoot] = useState("");
  const [folderPathEditId, setFolderPathEditId] = useState<string | null>(null);
  const [folderPathDraft, setFolderPathDraft] = useState("");
  const skipFolderPathBlurCommitRef = useRef(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const folderPickerAvailable = useMemo(() => canPickWorkspaceFolder(), []);
  const importFromBackupAvailable = useMemo(() => canPickImportPlanBackups(), []);

  useEffect(() => {
    if (!draftProjectId) {
      setDraftTitle("");
      setDraftWorkspaceRoot("");
      return;
    }
    const p = projects.find((x) => x.id === draftProjectId);
    setDraftTitle(p?.title ?? "");
    setDraftWorkspaceRoot(p?.workspaceRoot ?? "");
  }, [draftProjectId, projects]);

  useEffect(() => {
    if (!draftProjectId || !draftCardRef.current) return;
    draftCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [draftProjectId]);

  const tryCardDragStart = useCallback((e: DragEvent, id: string) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest("[data-no-card-drag], input, textarea, label")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget instanceof Element && e.currentTarget.contains(next)) return;
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === targetId) return;
      const list = [...orderedProjects];
      const fromIdx = list.findIndex((x) => x.id === draggedId);
      const toIdx = list.findIndex((x) => x.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = reorderByIndex(list, fromIdx, toIdx);
      reorderProjects(next.map((x) => x.id));
    },
    [orderedProjects, reorderProjects],
  );

  const handleDragEnd = useCallback(() => setDragOverId(null), []);

  const commitDraftWorkspaceRoot = useCallback(
    (projectId: string) => {
      const t = draftWorkspaceRoot.trim();
      onUpdateWorkspaceRoot(projectId, t ? t : undefined);
    },
    [draftWorkspaceRoot, onUpdateWorkspaceRoot],
  );

  const handleDraftBrowseFolder = useCallback(
    async (projectId: string) => {
      const p = await pickWorkspaceFolder();
      if (!p) return;
      setDraftWorkspaceRoot(p);
      onUpdateWorkspaceRoot(projectId, p);
    },
    [onUpdateWorkspaceRoot],
  );

  const handleExistingBrowseFolder = useCallback(
    async (projectId: string) => {
      const chosen = await pickWorkspaceFolder();
      if (!chosen) return;
      onUpdateWorkspaceRoot(projectId, chosen);
      setFolderPathEditId(null);
    },
    [onUpdateWorkspaceRoot],
  );

  const commitExistingFolderPath = useCallback(
    (projectId: string) => {
      const t = folderPathDraft.trim();
      onUpdateWorkspaceRoot(projectId, t ? t : undefined);
      setFolderPathEditId(null);
    },
    [folderPathDraft, onUpdateWorkspaceRoot],
  );

  const openDraftProject = useCallback(
    (projectId: string, title: string) => {
      onUpdateProjectTitle(projectId, title);
      commitDraftWorkspaceRoot(projectId);
      onOpenProject(projectId, title);
    },
    [commitDraftWorkspaceRoot, onOpenProject, onUpdateProjectTitle],
  );

  const requestDelete = useCallback(
    (p: PlanWorkspaceEntry, isDraftCard: boolean) => {
      const label = p.title.trim() || "Untitled project";
      const msg = isDraftCard
        ? "Discard this new project?"
        : `Delete “${label}”? This cannot be undone.`;
      if (window.confirm(msg)) onDeleteProject(p.id);
    },
    [onDeleteProject],
  );

  const handleImportBackups = useCallback(async () => {
    const r = await pickImportPlanBackups();
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    if (r.projects.length) {
      onImportProjects(r.projects);
    }
    if (r.errors.length > 0) {
      const msg =
        r.projects.length > 0
          ? `Imported ${r.projects.length} project(s).\n\nSkipped:\n${r.errors.join("\n")}`
          : `Could not import:\n${r.errors.join("\n")}`;
      window.alert(msg);
    }
  }, [onImportProjects]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.hostHint}>
            {canSaveWorkspaceToDisk()
              ? "Saved to disk — projects persist across restarts"
              : canPickWorkspaceFolder()
                ? "Folder picker ready (localStorage only)"
                : "Open with npm run dev:electron for disk persistence (browser uses localStorage only)"}
          </p>
        </div>
        <div className={styles.headerActions}>
          {importFromBackupAvailable ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void handleImportBackups()}
            >
              Import from plan.json…
            </button>
          ) : null}
          <button type="button" className={styles.newBtn} onClick={onNewProject}>
            New project
          </button>
        </div>
      </header>
      <main className={styles.main}>
        {projects.length === 0 ? (
          <p className={styles.empty}>
            No projects yet.
            {importFromBackupAvailable
              ? " Import from a repo’s .orca-plan/plan.json (e.g. under Documents), or create a new project."
              : " Create one to get started."}
          </p>
        ) : (
          <div className={styles.grid}>
            {orderedProjects.map((p) => {
              const { primary, secondary } = summarize(p);
              const isDraft = draftProjectId === p.id;

              if (isDraft) {
                return (
                  <div
                    key={p.id}
                    ref={draftCardRef}
                    data-project-card={p.id}
                    draggable
                    className={`${styles.card} ${styles.cardDraft} ${dragOverId === p.id ? styles.cardDropTarget : ""}`}
                    onDragStart={(e) => tryCardDragStart(e, p.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, p.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, p.id)}
                  >
                    <div className={styles.cardToolbar}>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        data-no-card-drag
                        aria-label="Discard new project"
                        title="Discard"
                        onClick={() => requestDelete(p, true)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                    <label className={styles.srOnly} htmlFor={`project-name-${p.id}`}>
                      Project name
                    </label>
                    <input
                      id={`project-name-${p.id}`}
                      className={styles.titleInput}
                      data-no-card-drag
                      value={draftTitle}
                      placeholder="Project name"
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => onUpdateProjectTitle(p.id, draftTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          openDraftProject(p.id, draftTitle);
                        }
                      }}
                      autoComplete="off"
                      autoFocus
                    />
                    <label className={styles.srOnly} htmlFor={`project-folder-${p.id}`}>
                      Local folder
                    </label>
                    <p className={styles.cardFolderLabel}>Folder</p>
                    <div className={styles.workspaceRow}>
                      <input
                        id={`project-folder-${p.id}`}
                        className={styles.workspaceInput}
                        data-no-card-drag
                        value={draftWorkspaceRoot}
                        placeholder="Local folder path"
                        onChange={(e) => setDraftWorkspaceRoot(e.target.value)}
                        onBlur={() => commitDraftWorkspaceRoot(p.id)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {folderPickerAvailable ? (
                        <button
                          type="button"
                          className={styles.folderBtn}
                          data-no-card-drag
                          title="Choose folder"
                          onClick={() => void handleDraftBrowseFolder(p.id)}
                        >
                          <FolderOpen size={16} strokeWidth={2} aria-hidden />
                          Browse
                        </button>
                      ) : null}
                    </div>
                    <p className={styles.cardMeta}>{primary}</p>
                    <p className={styles.cardMetaSecondary}>{secondary}</p>
                    <button
                      type="button"
                      className={styles.enterBtn}
                      data-no-card-drag
                      onClick={() => {
                        openDraftProject(p.id, draftTitle);
                      }}
                    >
                      Open plan
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  data-project-card={p.id}
                  draggable
                  className={`${styles.card} ${dragOverId === p.id ? styles.cardDropTarget : ""}`}
                  onDragStart={(e) => tryCardDragStart(e, p.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, p.id)}
                >
                  <div className={styles.cardToolbar}>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      data-no-card-drag
                      aria-label={`Delete project ${p.title.trim() || "Untitled project"}`}
                      title="Delete project"
                      onClick={() => requestDelete(p, false)}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.cardOpen}
                    onClick={() => onOpenProject(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenProject(p.id);
                      }
                    }}
                  >
                    <h2 className={styles.cardTitle}>
                      {p.title.trim() || "Untitled project"}
                    </h2>
                    <p className={styles.cardMeta}>{primary}</p>
                    <p className={styles.cardMetaSecondary}>{secondary}</p>
                  </div>
                  <div className={styles.cardFolderBlock} data-no-card-drag>
                    <p className={styles.cardFolderLabel}>Folder</p>
                    {folderPathEditId === p.id ? (
                      <div className={styles.workspaceRow}>
                        <input
                          className={styles.workspaceInput}
                          data-no-card-drag
                          value={folderPathDraft}
                          placeholder="Local folder path"
                          onChange={(e) => setFolderPathDraft(e.target.value)}
                          onBlur={() => {
                            if (skipFolderPathBlurCommitRef.current) {
                              skipFolderPathBlurCommitRef.current = false;
                              return;
                            }
                            commitExistingFolderPath(p.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              skipFolderPathBlurCommitRef.current = true;
                              setFolderPathEditId(null);
                            }
                          }}
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Project folder path"
                        />
                        {folderPickerAvailable ? (
                          <button
                            type="button"
                            className={styles.folderBtn}
                            data-no-card-drag
                            title="Choose folder"
                            onClick={() => void handleExistingBrowseFolder(p.id)}
                          >
                            <FolderOpen size={16} strokeWidth={2} aria-hidden />
                            Browse
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <p className={p.workspaceRoot ? styles.cardPath : styles.cardPathMuted}>
                          {p.workspaceRoot ? truncatePath(p.workspaceRoot, 56) : "No folder set"}
                        </p>
                        <div className={styles.cardFolderActions}>
                          {folderPickerAvailable ? (
                            <button
                              type="button"
                              className={styles.cardFolderActionBtn}
                              data-no-card-drag
                              onClick={() => void handleExistingBrowseFolder(p.id)}
                            >
                              Choose folder…
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.cardFolderActionBtn}
                            data-no-card-drag
                            onClick={() => {
                              setFolderPathEditId(p.id);
                              setFolderPathDraft(p.workspaceRoot ?? "");
                            }}
                          >
                            Edit path
                          </button>
                          {p.workspaceRoot ? (
                            <button
                              type="button"
                              className={styles.cardFolderActionBtnMuted}
                              data-no-card-drag
                              onClick={() => onUpdateWorkspaceRoot(p.id, undefined)}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
