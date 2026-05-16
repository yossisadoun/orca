import { ArrowLeft, MessageCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PlanItemGroup, PlanProjectSnapshot, PlanTrack, PlanTrackItem, PlanWorkspaceEntry } from "../types";
import { canUseWorkspaceFileTree, canUseWorkspacePty, listPlanVersions, loadPlanVersion, readPlanBackup, savePlanVersion, subscribeWorkspaceFsChanged, type PlanVersionEntry } from "../orcaPlanHost";
import { computeWaves } from "../utils/parallelWaves";
import { pruneOrphanPlanItemGroups } from "../utils/planItemDisplay";
import { nextId } from "../utils/persistence";
import { ClaudeAgentPanel } from "./ClaudeAgentPanel";
import { PlanCompactView } from "./PlanCompactView";
import { PlanItemDetailPopup } from "./PlanItemDetailPopup";
import { ProjectDocs } from "./ProjectDocs";
import { ReleaseLog } from "./ReleaseLog";
import styles from "./PlanProjectScreen.module.css";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

export function PlanProjectScreen({
  project,
  onBack,
  onUpdateSnapshot,
  onRenameProject,
  onUpdateGitHub,
}: {
  project: PlanWorkspaceEntry;
  onBack: () => void;
  onUpdateSnapshot: (snapshot: PlanProjectSnapshot) => void;
  onRenameProject: (title: string) => void;
  onUpdateGitHub?: (github: { owner: string; repo: string; defaultBranch: string }) => void;
}) {
  const { snapshot } = project;
  const { planTracks, planTrackItems, planItemGroups } = snapshot;

  const patch = useCallback(
    (fn: (s: PlanProjectSnapshot) => PlanProjectSnapshot) => {
      onUpdateSnapshot(fn(snapshot));
    },
    [onUpdateSnapshot, snapshot],
  );

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitleDraft(project.title);
  }, [project.id, project.title]);

  const workspaceRootEffective = project.workspaceRoot?.trim() ?? "";
  const fileTreeHost = canUseWorkspaceFileTree();
  const ptyHost = canUseWorkspacePty();
  const canShowFileTree = Boolean(workspaceRootEffective) && fileTreeHost;
  const showAgentPanel = Boolean(workspaceRootEffective) && ptyHost;

  // Ensure plan schema file exists on disk
  useEffect(() => {
    if (!workspaceRootEffective) return;
    const fn = window.orcaPlan?.ensurePlanSchema;
    if (fn) void fn(workspaceRootEffective);
  }, [workspaceRootEffective]);

  // Auto-detect GitHub repo
  useEffect(() => {
    if (!workspaceRootEffective || project.github) return;
    const fn = window.orcaPlan?.detectGitHub;
    if (!fn) return;
    void fn(workspaceRootEffective).then((raw: unknown) => {
      if (!raw || typeof raw !== "object" || !("ok" in raw)) return;
      const r = raw as { ok: boolean; owner?: string; repo?: string; defaultBranch?: string };
      if (!r.ok || !r.owner || !r.repo) return;
      onUpdateGitHub?.({ owner: r.owner, repo: r.repo, defaultBranch: r.defaultBranch || "main" });
    });
  }, [workspaceRootEffective, project.github, onUpdateGitHub]);

  // On project open, merge agent data from plan.json into memory.
  // plan.json is the agent's working copy; workspace.json is Orca's.
  // Merge: take agent-written fields from disk, keep user-owned fields from memory.
  useEffect(() => {
    if (!workspaceRootEffective) return;
    void readPlanBackup(workspaceRootEffective).then((r) => {
      if (!r.ok) return;
      const disk = r.snapshot as PlanProjectSnapshot;
      const diskJson = JSON.stringify(disk);
      const memJson = JSON.stringify(snapshot);
      if (diskJson === memJson) return;

      const memById = new Map(snapshot.planTrackItems.map((i) => [i.id, i]));
      const mergedItems = disk.planTrackItems.map((diskItem: PlanTrackItem) => {
        const memItem = memById.get(diskItem.id);
        if (!memItem) return diskItem;
        return {
          ...diskItem,
          status: memItem.status ?? diskItem.status, // prefer memory if set
          lastInteractedAt: memItem.lastInteractedAt,
        };
      });

      onUpdateSnapshot({
        ...disk,
        planTrackItems: mergedItems,
        releaseLog: snapshot.releaseLog, // keep user-owned
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRootEffective, project.id]);
  const [agentMinimized, setAgentMinimized] = useState(false);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(() => {
    try { return localStorage.getItem("orca-plan.file-tree-collapsed") === "true"; } catch { return false; }
  });
  const showWorkspaceFileTree = canShowFileTree && !fileTreeCollapsed;
  useEffect(() => {
    try { localStorage.setItem("orca-plan.file-tree-collapsed", String(fileTreeCollapsed)); } catch { /* ignore */ }
  }, [fileTreeCollapsed]);

  // --- Item detail popup ---
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const detailItem = detailItemId ? planTrackItems.find((i) => i.id === detailItemId) ?? null : null;
  const detailTrack = detailItem ? planTracks.find((t) => t.id === detailItem.trackId) : undefined;

  // --- Item-level chat ---
  const [activeItemChatId, setActiveItemChatId] = useState<string | null>(null);
  const activeItemChat = activeItemChatId
    ? planTrackItems.find((i) => i.id === activeItemChatId) ?? null
    : null;

  // --- Track item interactions ---
  const touchItem = useCallback((itemId: string) => {
    patch((s) => ({
      ...s,
      planTrackItems: s.planTrackItems.map((i) =>
        i.id === itemId ? { ...i, lastInteractedAt: new Date().toISOString() } : i,
      ),
    }));
  }, [patch]);

  const openItemChat = useCallback((itemId: string) => {
    touchItem(itemId);
    // Auto-set in_progress when opening chat for a backlog item
    const item = planTrackItems.find((i) => i.id === itemId);
    if (item && (!item.status || item.status === "backlog")) {
      patch((s) => ({
        ...s,
        planTrackItems: s.planTrackItems.map((i) =>
          i.id === itemId ? { ...i, status: "in_progress" as const } : i,
        ),
      }));
    }
    setActiveItemChatId(itemId);
    setAgentMinimized(false);
    // Mark as seen
    void window.orcaPlan?.ptyMarkSeen?.(itemId);
  }, [touchItem, planTrackItems, patch]);

  const openItemDetail = useCallback((itemId: string) => {
    touchItem(itemId);
    setDetailItemId(itemId);
    void window.orcaPlan?.ptyMarkSeen?.(itemId);
  }, [touchItem]);

  // --- Unseen chat sessions ---
  const [unseenSessions, setUnseenSessions] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fn = window.orcaPlan?.ptyUnseenSessions;
    if (!fn) return;
    const poll = () => {
      void fn().then((raw: unknown) => {
        if (raw && typeof raw === "object" && "sessions" in raw) {
          setUnseenSessions(new Set((raw as { sessions: string[] }).sessions));
        }
      });
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, []);

  // --- Heat map toggle ---
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);

  // --- Auto-save plan versions ---
  const snapshotJsonRef = useRef("");
  const viewingHistoryRef = useRef(false);
  const suppressWatcherUntilRef = useRef(0);
  useEffect(() => {
    if (!workspaceRootEffective) return;
    // Don't save versions when browsing history
    if (viewingHistoryRef.current) return;
    const json = JSON.stringify(snapshot);
    if (json === snapshotJsonRef.current) return;
    const isFirst = snapshotJsonRef.current === "";
    snapshotJsonRef.current = json;
    if (isFirst) return;
    // Brief suppress to avoid unnecessary watcher reads from version saves
    suppressWatcherUntilRef.current = Date.now() + 2000;
    const id = window.setTimeout(() => {
      void savePlanVersion(workspaceRootEffective, "ui", json);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [workspaceRootEffective, snapshot]);

  // --- Watch for external plan.json changes (agent edits) ---
  // Since Orca doesn't write plan.json, any change is from the agent.
  // Merge agent data into the current snapshot without overwriting user state.
  useEffect(() => {
    if (!workspaceRootEffective) return;
    const unsub = subscribeWorkspaceFsChanged(({ workspaceRoot: changedRoot }) => {
      if (changedRoot !== workspaceRootEffective) return;
      if (Date.now() < suppressWatcherUntilRef.current) return;
      void readPlanBackup(workspaceRootEffective).then((r) => {
        if (!r.ok) return;
        const diskSnapshot = r.snapshot as PlanProjectSnapshot;
        const diskJson = JSON.stringify(diskSnapshot);
        if (diskJson === snapshotJsonRef.current) return;
        snapshotJsonRef.current = diskJson;

        // Merge: take the disk snapshot as the base, but preserve user-owned fields from memory
        patch((currentSnapshot) => {
          const currentById = new Map(currentSnapshot.planTrackItems.map((i) => [i.id, i]));

          // Use disk tracks and items as the structure (agent may have added/removed)
          const mergedItems = diskSnapshot.planTrackItems.map((diskItem: PlanTrackItem) => {
            const memItem = currentById.get(diskItem.id);
            if (!memItem) return diskItem; // new item from agent
            // Prefer memory for user-owned fields, disk for everything else
            return {
              ...diskItem,
              status: memItem.status, // user owns status
              lastInteractedAt: memItem.lastInteractedAt,
            };
          });

          return {
            ...diskSnapshot,
            planTrackItems: mergedItems,
            // Keep release log from memory (user-owned)
            releaseLog: currentSnapshot.releaseLog,
          };
        });

        void savePlanVersion(workspaceRootEffective, "agent", diskJson);
      });
    });
    return () => { unsub?.(); };
  }, [workspaceRootEffective, patch]);

  // --- Version history (time machine) ---
  const [versions, setVersions] = useState<PlanVersionEntry[]>([]);
  const [versionIndex, setVersionIndex] = useState<number | null>(null);
  const isViewingHistory = versionIndex !== null;
  viewingHistoryRef.current = isViewingHistory;

  // Refresh version list periodically and after saves
  useEffect(() => {
    if (!workspaceRootEffective) return;
    let cancelled = false;
    const refresh = () => {
      void listPlanVersions(workspaceRootEffective).then((v) => {
        if (!cancelled) setVersions(v);
      });
    };
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [workspaceRootEffective, snapshot]);

  const handleVersionNavigate = useCallback((delta: number) => {
    // delta: -1 = older, +1 = newer
    if (versions.length === 0) return;
    const currentIdx = versionIndex ?? -1; // -1 means "live"
    const newIdx = currentIdx - delta; // versions are newest-first, so -1 delta = +1 index

    if (newIdx < 0) {
      // Back to live
      setVersionIndex(null);
      return;
    }
    if (newIdx >= versions.length) return;

    setVersionIndex(newIdx);
    const entry = versions[newIdx];
    if (!entry || !workspaceRootEffective) return;
    void loadPlanVersion(workspaceRootEffective, entry.filename).then((r) => {
      if (!r.ok) return;
      const snap = r.snapshot as PlanProjectSnapshot;
      if (snap && snap.v === 1) {
        onUpdateSnapshot(snap);
      }
    });
  }, [versions, versionIndex, workspaceRootEffective, onUpdateSnapshot]);

  const handleRestoreVersion = useCallback(() => {
    // Restoring = adopt the currently displayed snapshot as the new current plan.
    // This saves a new version (so history is preserved) and exits history mode.
    if (!workspaceRootEffective) return;
    const json = JSON.stringify(snapshot);
    snapshotJsonRef.current = json;
    void savePlanVersion(workspaceRootEffective, "ui", json);
    setVersionIndex(null);
  }, [workspaceRootEffective, snapshot]);

  // --- Resizable agent panel ---
  const [agentWidth, setAgentWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("orca-plan.agent-panel-width");
      if (saved) { const n = Number(saved); if (n >= 200 && n <= 1200) return n; }
    } catch { /* ignore */ }
    return 420;
  });
  const resizingRef = useRef(false);
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = agentWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(200, Math.min(1200, startW + delta));
      setAgentWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setAgentWidth((w) => { localStorage.setItem("orca-plan.agent-panel-width", String(w)); return w; });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [agentWidth]);

  const [githubUrlInput, setGithubUrlInput] = useState<string | null>(null);
  const displayTitle = project.title.trim() || "Untitled project";

  const startTitleEdit = () => {
    setTitleDraft(project.title);
    setTitleEditing(true);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  };

  const commitTitle = () => {
    const t = titleDraft.trim() || "Untitled project";
    setTitleEditing(false);
    if (t !== (project.title.trim() || "Untitled project")) {
      onRenameProject(t);
      patch((s) => ({ ...s, title: t }));
    }
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleInputRef.current?.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setTitleDraft(project.title);
      setTitleEditing(false);
    }
  };

  const handleMovePlanItem = useCallback(
    (itemId: string, targetTrackId: string, beforeItemId: string | null) => {
      if (beforeItemId === itemId) return;
      patch((s) => {
        const items = [...s.planTrackItems];
        const fromIdx = items.findIndex((i) => i.id === itemId);
        if (fromIdx < 0) return s;
        const moving = items[fromIdx]!;
        const rest = [...items.slice(0, fromIdx), ...items.slice(fromIdx + 1)];
        const updated: PlanTrackItem = { ...moving, trackId: targetTrackId };

        if (beforeItemId === null) {
          let insertAt = rest.length;
          for (let i = rest.length - 1; i >= 0; i--) {
            if (rest[i]!.trackId === targetTrackId) {
              insertAt = i + 1;
              break;
            }
          }
          const out = [...rest];
          out.splice(insertAt, 0, updated);
          return { ...s, planTrackItems: out };
        }

        const beforeIdx = rest.findIndex((i) => i.id === beforeItemId);
        if (beforeIdx < 0) {
          return { ...s, planTrackItems: [...rest, updated] };
        }
        const out = [...rest];
        out.splice(beforeIdx, 0, updated);
        return { ...s, planTrackItems: out };
      });
    },
    [patch],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Back to projects">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden />
          Projects
        </button>
        <div className={styles.titleBlock}>
          {titleEditing ? (
            <input
              ref={titleInputRef}
              className={styles.titleInput}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              aria-label="Project name"
            />
          ) : (
            <button type="button" className={styles.titleBtn} onClick={startTitleEdit} title="Rename project">
              {displayTitle}
            </button>
          )}
        </div>
        {project.github ? (
          <span
            className={styles.githubBadge}
            title={`${project.github.owner}/${project.github.repo} (${project.github.defaultBranch})`}
          >
            {project.github.owner}/{project.github.repo}
          </span>
        ) : workspaceRootEffective ? (
          githubUrlInput !== null ? (
            <input
              className={styles.githubInput}
              value={githubUrlInput}
              onChange={(e) => setGithubUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const m = githubUrlInput.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
                  if (m) {
                    onUpdateGitHub?.({ owner: m[1], repo: m[2], defaultBranch: "main" });
                  }
                  setGithubUrlInput(null);
                }
                if (e.key === "Escape") setGithubUrlInput(null);
              }}
              onBlur={() => setGithubUrlInput(null)}
              placeholder="https://github.com/owner/repo"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className={styles.githubConnectBtn}
              onClick={() => setGithubUrlInput("")}
              title="Connect to GitHub"
            >
              + GitHub
            </button>
          )
        ) : null}
      </header>
      <div className={styles.body}>
        {canShowFileTree ? (
          showWorkspaceFileTree ? (
            <aside className={styles.filesAside} aria-label="Workspace files">
              <div className={styles.filesAsideHeader}>
                <button
                  type="button"
                  className={styles.filesCollapseBtn}
                  onClick={() => setFileTreeCollapsed(true)}
                  title="Collapse file tree"
                >
                  <PanelLeftClose size={15} strokeWidth={2} />
                </button>
              </div>
              <WorkspaceFileTree
                key={workspaceRootEffective}
                workspaceRoot={workspaceRootEffective}
                projectTitle={displayTitle}
              />
            </aside>
          ) : (
            <div className={styles.filesCollapsed}>
              <button
                type="button"
                className={styles.filesExpandBtn}
                onClick={() => setFileTreeCollapsed(false)}
                title="Show file tree"
              >
                <PanelLeftOpen size={15} strokeWidth={2} />
              </button>
            </div>
          )
        ) : null}
        <div className={styles.center}>
          <div className={styles.mainColumn}>
          <main className={styles.main}>
            <div className={styles.planWrap}>
          {workspaceRootEffective ? (
            <ProjectDocs workspaceRoot={workspaceRootEffective} />
          ) : null}
          <PlanCompactView
            tracks={planTracks}
            items={planTrackItems}
            itemGroups={planItemGroups}
            onAddTrack={(title, description) => {
              const trimmedDesc = description?.trim();
              patch((s) => ({
                ...s,
                planTracks: [
                  ...s.planTracks,
                  {
                    id: nextId("track"),
                    title,
                    ...(trimmedDesc ? { description: trimmedDesc } : {}),
                  },
                ],
              }));
            }}
            onUpdateTrack={(id, { title, description }) => {
              patch((s) => ({
                ...s,
                planTracks: s.planTracks.map((t) => {
                  if (t.id !== id) return t;
                  const trimmed = description?.trim();
                  const next: PlanTrack = { id: t.id, title: title.trim() };
                  if (trimmed) next.description = trimmed;
                  if (t.minimized) next.minimized = true;
                  return next;
                }),
              }));
            }}
            onRemoveTrack={(id) => {
              patch((s) => {
                const nextTracks = s.planTracks.filter((t) => t.id !== id);
                const nextItems = s.planTrackItems.filter((i) => i.trackId !== id);
                return {
                  ...s,
                  planTracks: nextTracks,
                  planTrackItems: nextItems,
                  planItemGroups: pruneOrphanPlanItemGroups(nextItems, s.planItemGroups),
                };
              });
            }}
            onAddItem={(trackId, label, description) => {
              const trimmedLabel = label.trim();
              if (!trimmedLabel) return;
              const desc = description?.trim();
              patch((s) => ({
                ...s,
                planTrackItems: [
                  ...s.planTrackItems,
                  {
                    id: nextId("pti"),
                    trackId,
                    label: trimmedLabel,
                    ...(desc ? { description: desc } : {}),
                  },
                ],
              }));
            }}
            onUpdateItem={(itemId, payload) => {
              patch((s) => ({
                ...s,
                planTrackItems: s.planTrackItems.map((i) => {
                  if (i.id !== itemId) return i;
                  const label = payload.label.trim();
                  if (!label) return i;
                  const d = payload.description?.trim();
                  const next: PlanTrackItem = { id: i.id, trackId: i.trackId, label };
                  if (d) next.description = d;
                  if (i.itemGroupId) next.itemGroupId = i.itemGroupId;
                  return next;
                }),
              }));
            }}
            onRemoveItem={(itemId) => {
              patch((s) => {
                const next = s.planTrackItems.filter((i) => i.id !== itemId);
                return {
                  ...s,
                  planTrackItems: next,
                  planItemGroups: pruneOrphanPlanItemGroups(next, s.planItemGroups),
                };
              });
            }}
            onAssignItemsToGroup={(itemIds, groupTitle) => {
              const label = groupTitle.trim();
              if (!label || itemIds.length < 2) return;
              const idSet = new Set(itemIds);
              patch((s) => {
                const picked = s.planTrackItems.filter((i) => idSet.has(i.id));
                if (picked.length < 2) return s;
                const tid = picked[0]!.trackId;
                if (!picked.every((i) => i.trackId === tid)) return s;
                const gid = nextId("pig");
                const nextItems = s.planTrackItems.map((i) =>
                  idSet.has(i.id) ? { ...i, itemGroupId: gid } : i,
                );
                const nextGroups: PlanItemGroup[] = pruneOrphanPlanItemGroups(nextItems, [
                  ...s.planItemGroups,
                  { id: gid, title: label },
                ]);
                return { ...s, planTrackItems: nextItems, planItemGroups: nextGroups };
              });
            }}
            onReorderTracks={(fromIndex, toIndex) => {
              patch((s) => {
                if (fromIndex === toIndex) return s;
                if (
                  fromIndex < 0 ||
                  toIndex < 0 ||
                  fromIndex >= s.planTracks.length ||
                  toIndex >= s.planTracks.length
                ) {
                  return s;
                }
                const next = [...s.planTracks];
                const [removed] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, removed!);
                return { ...s, planTracks: next };
              });
            }}
            onMovePlanItem={handleMovePlanItem}
            onOpenItemChat={undefined}
            activeItemChatId={activeItemChatId}
            onOpenItemDetail={openItemDetail}
            unseenSessions={unseenSessions}
            heatMapEnabled={heatMapEnabled}
            onToggleHeatMap={() => setHeatMapEnabled((v) => !v)}
            onUpdateStatus={(itemId, status) => {
              patch((s) => {
                const item = s.planTrackItems.find((i) => i.id === itemId);
                const addToLog = status === "done" && item && item.status !== "done";
                return {
                  ...s,
                  planTrackItems: s.planTrackItems.map((i) =>
                    i.id === itemId ? { ...i, status } : i,
                  ),
                  releaseLog: addToLog
                    ? [...(s.releaseLog ?? []), {
                        id: nextId("rl"),
                        label: item!.label,
                        planItemId: itemId,
                        addedAt: new Date().toISOString(),
                        released: false,
                      }]
                    : s.releaseLog,
                };
              });
            }}
            onUpdateDevOrder={(itemId, devOrder) => {
              patch((s) => ({
                ...s,
                planTrackItems: s.planTrackItems.map((i) =>
                  i.id === itemId ? { ...i, devOrder } : i,
                ),
              }));
            }}
            versionCount={versions.length}
            versionIndex={versionIndex ?? undefined}
            onVersionNavigate={handleVersionNavigate}
            onRestoreVersion={handleRestoreVersion}
            isViewingHistory={isViewingHistory}
          />
          <ReleaseLog
            entries={snapshot.releaseLog ?? []}
            onUpdate={(entries) => {
              patch((s) => ({ ...s, releaseLog: entries }));
            }}
          />
            </div>
          </main>
        </div>
        </div>
      </div>
      {showAgentPanel && agentMinimized ? (
        <button
          type="button"
          className={styles.bottomPanelTab}
          onClick={() => setAgentMinimized(false)}
        >
          <MessageCircle size={14} strokeWidth={2} />
          Master Plan
        </button>
      ) : null}
      {showAgentPanel && !agentMinimized ? (
        <div className={styles.bottomPanel} style={{ height: agentWidth }}>
          <div
            className={styles.bottomResizeHandle}
            onPointerDown={(e: React.PointerEvent) => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = agentWidth;
              const onMove = (ev: PointerEvent) => {
                const delta = startY - ev.clientY;
                const next = Math.max(150, Math.min(800, startH + delta));
                setAgentWidth(next);
              };
              const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                setAgentWidth((h) => { localStorage.setItem("orca-plan.agent-panel-width", String(h)); return h; });
              };
              document.body.style.cursor = "row-resize";
              document.body.style.userSelect = "none";
              document.addEventListener("pointermove", onMove);
              document.addEventListener("pointerup", onUp);
            }}
          />
          <ClaudeAgentPanel
            key={workspaceRootEffective}
            workspaceRoot={workspaceRootEffective}
            snapshot={snapshot}
            github={project.github}
            onMinimize={() => setAgentMinimized(true)}
          />
        </div>
      ) : null}
      {detailItem ? (
        <PlanItemDetailPopup
          item={detailItem}
          track={detailTrack}
          wave={computeWaves(planTrackItems).get(detailItem.id)}
          workspaceRoot={workspaceRootEffective}
          snapshot={snapshot}
          github={project.github}
          onClose={() => setDetailItemId(null)}
          onUpdateItem={(itemId, payload) => {
            patch((s) => ({
              ...s,
              planTrackItems: s.planTrackItems.map((i) => {
                if (i.id !== itemId) return i;
                return {
                  ...i,
                  ...(payload.label != null ? { label: payload.label } : {}),
                  ...(payload.description !== undefined ? { description: payload.description } : {}),
                };
              }),
            }));
          }}
          onToggleChecklistItem={(itemId, clId, done) => {
            patch((s) => ({
              ...s,
              planTrackItems: s.planTrackItems.map((i) => {
                if (i.id !== itemId || !i.checklist) return i;
                const newChecklist = i.checklist.map((cl) =>
                  cl.id === clId ? { ...cl, done } : cl,
                );
                return {
                  ...i,
                  checklist: newChecklist,
                };
              }),
            }));
          }}
          onUpdateStatus={(itemId, status) => {
            patch((s) => {
              const item = s.planTrackItems.find((i) => i.id === itemId);
              const addToLog = status === "done" && item && item.status !== "done";
              return {
                ...s,
                planTrackItems: s.planTrackItems.map((i) =>
                  i.id === itemId ? { ...i, status } : i,
                ),
                releaseLog: addToLog
                  ? [...(s.releaseLog ?? []), {
                      id: nextId("rl"),
                      label: item!.label,
                      planItemId: itemId,
                      addedAt: new Date().toISOString(),
                      released: false,
                    }]
                  : s.releaseLog,
              };
            });
          }}
          onSessionDetected={detailItemId ? (sessionId) => {
            patch((s) => ({
              ...s,
              planTrackItems: s.planTrackItems.map((i) =>
                i.id === detailItemId ? { ...i, claudeSessionId: sessionId } : i,
              ),
            }));
          } : undefined}
          onDeleteItem={(itemId) => {
            patch((s) => ({
              ...s,
              planTrackItems: s.planTrackItems.filter((i) => i.id !== itemId),
            }));
          }}
        />
      ) : null}
    </div>
  );
}
