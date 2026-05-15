import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PlanItemGroup, PlanProjectSnapshot, PlanTrack, PlanTrackItem, PlanWorkspaceEntry } from "../types";
import { suppressBackupFlush } from "../App";
import { canUseWorkspaceFileTree, canUseWorkspacePty, listPlanVersions, loadPlanVersion, readPlanBackup, savePlanVersion, subscribeWorkspaceFsChanged, type PlanVersionEntry } from "../orcaPlanHost";
import { pruneOrphanPlanItemGroups } from "../utils/planItemDisplay";
import { nextId } from "../utils/persistence";
import { ClaudeAgentPanel } from "./ClaudeAgentPanel";
import { PlanCompactView } from "./PlanCompactView";
import { PlanItemDetailPopup } from "./PlanItemDetailPopup";
import { ProjectDocs } from "./ProjectDocs";
import styles from "./PlanProjectScreen.module.css";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

export function PlanProjectScreen({
  project,
  onBack,
  onUpdateSnapshot,
  onRenameProject,
}: {
  project: PlanWorkspaceEntry;
  onBack: () => void;
  onUpdateSnapshot: (snapshot: PlanProjectSnapshot) => void;
  onRenameProject: (title: string) => void;
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

  // On project open, merge agent-written fields from disk plan.json into memory
  useEffect(() => {
    if (!workspaceRootEffective) return;
    void readPlanBackup(workspaceRootEffective).then((r) => {
      if (!r.ok) return;
      const diskItems = r.snapshot.planTrackItems ?? [];
      if (diskItems.length === 0) return;
      const diskById = new Map(diskItems.map((i: PlanTrackItem) => [i.id, i]));
      const agentFields: (keyof PlanTrackItem)[] = ["checklist", "lastNote", "lastNoteAt", "claudeSessionId"];
      let changed = false;
      const merged = snapshot.planTrackItems.map((item) => {
        const diskItem = diskById.get(item.id);
        if (!diskItem) return item;
        let patched = item;
        for (const field of agentFields) {
          if (diskItem[field] !== undefined && diskItem[field] !== null && (item[field] === undefined || item[field] === null)) {
            if (patched === item) patched = { ...item };
            (patched as unknown as Record<string, unknown>)[field] = diskItem[field];
            changed = true;
          }
        }
        return patched;
      });
      if (changed) {
        suppressBackupFlush(3000);
        onUpdateSnapshot({ ...snapshot, planTrackItems: merged });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRootEffective, project.id]);
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
    setActiveItemChatId(itemId);
  }, [touchItem]);

  const openItemDetail = useCallback((itemId: string) => {
    touchItem(itemId);
    setDetailItemId(itemId);
  }, [touchItem]);

  // --- Heat map toggle ---
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);

  // --- Auto-save plan versions ---
  const snapshotJsonRef = useRef("");
  const viewingHistoryRef = useRef(false);
  useEffect(() => {
    if (!workspaceRootEffective) return;
    // Don't save versions when browsing history
    if (viewingHistoryRef.current) return;
    const json = JSON.stringify(snapshot);
    if (json === snapshotJsonRef.current) return;
    const isFirst = snapshotJsonRef.current === "";
    snapshotJsonRef.current = json;
    if (isFirst) return;
    const id = window.setTimeout(() => {
      void savePlanVersion(workspaceRootEffective, "ui", json);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [workspaceRootEffective, snapshot]);

  // --- Watch for external plan.json changes (e.g. Claude agent edits) ---
  useEffect(() => {
    if (!workspaceRootEffective) return;
    const unsub = subscribeWorkspaceFsChanged(({ workspaceRoot: changedRoot }) => {
      if (changedRoot !== workspaceRootEffective) return;
      void readPlanBackup(workspaceRootEffective).then((r) => {
        if (!r.ok) return;
        const diskSnapshot = r.snapshot;
        // Only update if the disk version is different from what we have
        const diskJson = JSON.stringify(diskSnapshot);
        if (diskJson !== snapshotJsonRef.current) {
          snapshotJsonRef.current = diskJson;
          suppressBackupFlush(3000); // Don't write back what we just read
          onUpdateSnapshot(diskSnapshot);
          // Save as agent version
          void savePlanVersion(workspaceRootEffective, "agent", diskJson);
        }
      });
    });
    return () => { unsub?.(); };
  }, [workspaceRootEffective, onUpdateSnapshot]);

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
            onOpenItemChat={showAgentPanel ? openItemChat : undefined}
            activeItemChatId={activeItemChatId}
            onOpenItemDetail={openItemDetail}
            heatMapEnabled={heatMapEnabled}
            onToggleHeatMap={() => setHeatMapEnabled((v) => !v)}
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
            </div>
          </main>
        </div>
        {showAgentPanel ? (
          <>
            <div
              className={styles.resizeHandle}
              onPointerDown={handleResizeStart}
              aria-label="Resize Claude panel"
            />
            <aside
              className={styles.agentAside}
              style={{ width: agentWidth }}
              aria-label="Claude Code terminal"
            >
              <ClaudeAgentPanel
              key={activeItemChatId ? `item-${activeItemChatId}` : workspaceRootEffective}
              workspaceRoot={workspaceRootEffective}
              snapshot={snapshot}
              activeItem={activeItemChat}
              onBackToProject={activeItemChatId ? () => setActiveItemChatId(null) : undefined}
              onSessionDetected={activeItemChatId ? (sessionId) => {
                patch((s) => ({
                  ...s,
                  planTrackItems: s.planTrackItems.map((i) =>
                    i.id === activeItemChatId ? { ...i, claudeSessionId: sessionId } : i,
                  ),
                }));
              } : undefined}
            />
            </aside>
          </>
        ) : null}
        </div>
      </div>
      {detailItem ? (
        <PlanItemDetailPopup
          item={detailItem}
          track={detailTrack}
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
                return {
                  ...i,
                  checklist: i.checklist.map((cl) =>
                    cl.id === clId ? { ...cl, done } : cl,
                  ),
                };
              }),
            }));
          }}
          onOpenChat={showAgentPanel ? (id) => { openItemChat(id); setDetailItemId(null); } : undefined}
        />
      ) : null}
    </div>
  );
}
