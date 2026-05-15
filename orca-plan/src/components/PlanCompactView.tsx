import { ChevronLeft, ChevronRight, Clock, Flame, MessageCircle, Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PLAN_TRACK_ITEM_MIME } from "../constants/dnd";
import type { PlanTrack, PlanItemGroup, PlanTrackItem } from "../types";
import { buildPlanItemDisplayBlocks } from "../utils/planItemDisplay";
import styles from "./PlanCompactView.module.css";
import popoverStyles from "./PlanTracksPanel.module.css";


export function PlanCompactView({
  tracks,
  items,
  onAddTrack,
  onUpdateTrack,
  onRemoveTrack,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onReorderTracks,
  itemGroups,
  onAssignItemsToGroup,
  onMovePlanItem,
  onOpenItemChat,
  activeItemChatId,
  onUpdateDevOrder,
  onOpenItemDetail,
  heatMapEnabled,
  onToggleHeatMap,
  versionCount,
  versionIndex,
  onVersionNavigate,
  onRestoreVersion,
  isViewingHistory,
}: {
  tracks: PlanTrack[];
  items: PlanTrackItem[];
  itemGroups: PlanItemGroup[];
  onAddTrack: (title: string, description?: string) => void;
  onUpdateTrack: (id: string, payload: { title: string; description?: string }) => void;
  onRemoveTrack: (id: string) => void;
  onAddItem: (trackId: string, label: string, description?: string) => void;
  onUpdateItem: (itemId: string, payload: { label: string; description?: string }) => void;
  onRemoveItem: (itemId: string) => void;
  onReorderTracks: (fromIndex: number, toIndex: number) => void;
  onAssignItemsToGroup: (itemIds: string[], groupTitle: string) => void;
  /** Insert before `beforeItemId`, or append at end of `targetTrackId` when `beforeItemId` is null. */
  onMovePlanItem: (itemId: string, targetTrackId: string, beforeItemId: string | null) => void;
  /** Open a Claude chat session for a specific plan item. */
  onOpenItemChat?: (itemId: string) => void;
  /** ID of the plan item currently being chatted about (highlights it). */
  activeItemChatId?: string | null;
  /** Set the devOrder on a plan item. */
  onUpdateDevOrder?: (itemId: string, devOrder: number | undefined) => void;
  /** Open the item detail popup. */
  onOpenItemDetail?: (itemId: string) => void;
  /** Whether heat map coloring is enabled. */
  heatMapEnabled?: boolean;
  /** Toggle heat map on/off. */
  onToggleHeatMap?: () => void;
  /** Total number of versions in history. */
  versionCount?: number;
  /** Current version index (0 = latest/current). */
  versionIndex?: number;
  /** Navigate to a version by relative offset (-1 = older, +1 = newer). */
  onVersionNavigate?: (delta: number) => void;
  /** Restore the currently viewed historical version as the new current plan. */
  onRestoreVersion?: () => void;
  /** Whether we're currently viewing a historical version. */
  isViewingHistory?: boolean;
}) {
  // Heat map: rank items by most recent interaction
  const heatRankMap = useMemo(() => {
    if (!heatMapEnabled) return new Map<string, number>();
    const withTs = items
      .filter((i) => i.lastInteractedAt || i.lastNoteAt)
      .map((i) => ({ id: i.id, ts: i.lastInteractedAt || i.lastNoteAt || "" }))
      .sort((a, b) => b.ts.localeCompare(a.ts));
    const map = new Map<string, number>();
    withTs.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [heatMapEnabled, items]);

  // Dev order filter
  const maxDevOrder = Math.max(0, ...items.map((i) => i.devOrder ?? 0));
  const hasAnyDevOrder = items.some((i) => i.devOrder != null && i.devOrder > 0);
  const [devOrderFilter, setDevOrderFilter] = useState<number | null>(null); // null = show all
  const [devOrderEditItemId, setDevOrderEditItemId] = useState<string | null>(null);
  const [devOrderDraft, setDevOrderDraft] = useState("");
  const devOrderInputRef = useRef<HTMLInputElement>(null);

  const [trackFormOpen, setTrackFormOpen] = useState(false);
  const [itemFormTrackId, setItemFormTrackId] = useState<string | null>(null);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [trackName, setTrackName] = useState("");
  const [itemLabel, setItemLabel] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editItemLabel, setEditItemLabel] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");

  const popoverRef = useRef<HTMLDivElement>(null);
  const newTrackWrapRef = useRef<HTMLButtonElement>(null);
  const itemAddWrapRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const editTrackAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const editItemAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [draggingPlanItemId, setDraggingPlanItemId] = useState<string | null>(null);
  const [planItemDropBeforeId, setPlanItemDropBeforeId] = useState<string | null>(null);
  const [planItemDropAppendTrackId, setPlanItemDropAppendTrackId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogName, setGroupDialogName] = useState("");
  const spaceKeyDownRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const groupDialogInputRef = useRef<HTMLInputElement>(null);
  const trackNameInputRef = useRef<HTMLInputElement>(null);
  const draggingPlanItemIdRef = useRef<string | null>(null);
  const itemLabelInputRef = useRef<HTMLInputElement>(null);

  const trackNameId = useId();
  const itemLabelId = useId();
  const editTitleId = useId();
  const editDescId = useId();
  const editItemLabelId = useId();
  const editItemDescId = useId();
  const groupDialogHeadingId = useId();
  const groupDialogFieldId = useId();

  const formMode = editItemId
    ? "editItem"
    : editTrackId
      ? "edit"
      : itemFormTrackId
        ? "item"
        : trackFormOpen
          ? "track"
          : null;

  useLayoutEffect(() => {
    if (!formMode) {
      setPopoverPos(null);
      return;
    }

    const wrap =
      formMode === "track"
        ? newTrackWrapRef.current
        : formMode === "edit"
          ? editTrackId
            ? editTrackAnchorRefs.current[editTrackId]
            : null
          : formMode === "editItem"
            ? editItemId
              ? editItemAnchorRefs.current[editItemId]
              : null
            : itemFormTrackId
              ? itemAddWrapRefs.current[itemFormTrackId]
              : null;
    if (!wrap) return;

    const update = () => {
      const r = wrap.getBoundingClientRect();
      const w =
        formMode === "track"
          ? Math.min(220, window.innerWidth - 24)
          : formMode === "item"
            ? Math.min(340, window.innerWidth - 24)
            : Math.min(352, window.innerWidth - 24);
      let left = r.left;
      left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
      setPopoverPos({ top: r.bottom + 8, left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [formMode, itemFormTrackId, trackFormOpen, editTrackId, editItemId, tracks.length]);

  useEffect(() => {
    if (!formMode) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if ((e.target as Element).closest("[data-plan-compact-popover-anchor]")) return;
      setTrackFormOpen(false);
      setItemFormTrackId(null);
      setEditTrackId(null);
      setEditItemId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTrackFormOpen(false);
        setItemFormTrackId(null);
        setEditTrackId(null);
        setEditItemId(null);
        setContextMenu(null);
        setGroupDialogOpen(false);
        setSelectedItemIds(new Set());
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [formMode]);

  useEffect(() => {
    if (!trackFormOpen) {
      setTrackName("");
      return;
    }
    window.setTimeout(() => trackNameInputRef.current?.focus(), 0);
  }, [trackFormOpen]);

  useEffect(() => {
    if (!itemFormTrackId) {
      setItemLabel("");
      return;
    }
    window.setTimeout(() => itemLabelInputRef.current?.focus(), 0);
  }, [itemFormTrackId]);

  useEffect(() => {
    if (editTrackId && !tracks.some((t) => t.id === editTrackId)) {
      setEditTrackId(null);
    }
  }, [tracks, editTrackId]);

  useEffect(() => {
    if (editItemId && !items.some((i) => i.id === editItemId)) {
      setEditItemId(null);
    }
  }, [items, editItemId]);

  useEffect(() => {
    if (!draggingTrackId) return;
    const endDrag = () => {
      setDraggingTrackId(null);
      setDropTargetTrackId(null);
    };
    window.addEventListener("dragend", endDrag);
    return () => window.removeEventListener("dragend", endDrag);
  }, [draggingTrackId]);

  useEffect(() => {
    if (!draggingPlanItemId) return;
    const onWindowDragEnd = () => {
      draggingPlanItemIdRef.current = null;
      setDraggingPlanItemId(null);
      setPlanItemDropBeforeId(null);
      setPlanItemDropAppendTrackId(null);
    };
    window.addEventListener("dragend", onWindowDragEnd);
    return () => window.removeEventListener("dragend", onWindowDragEnd);
  }, [draggingPlanItemId]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        spaceKeyDownRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        spaceKeyDownRef.current = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [contextMenu]);

  useEffect(() => {
    if (
      selectedItemIds.size === 0 &&
      !contextMenu &&
      !groupDialogOpen
    ) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setContextMenu(null);
      setGroupDialogOpen(false);
      setGroupDialogName("");
      setSelectedItemIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItemIds.size, contextMenu, groupDialogOpen]);

  useEffect(() => {
    if (!groupDialogOpen) return;
    window.setTimeout(() => groupDialogInputRef.current?.focus(), 0);
  }, [groupDialogOpen]);

  const submitTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const t = trackName.trim();
    if (!t) return;
    onAddTrack(t, undefined);
    setTrackFormOpen(false);
  };

  const submitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormTrackId) return;
    const label = itemLabel.trim();
    if (!label) return;
    onAddItem(itemFormTrackId, label, undefined);
    setItemLabel("");
    window.setTimeout(() => {
      itemLabelInputRef.current?.focus();
    }, 0);
  };

  const submitEditTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTrackId) return;
    const t = editTitle.trim();
    if (!t) return;
    const d = editDescription.trim();
    onUpdateTrack(editTrackId, { title: t, description: d || undefined });
    setEditTrackId(null);
  };

  const submitEditItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemId) return;
    const label = editItemLabel.trim();
    if (!label) return;
    const desc = editItemDescription.trim();
    onUpdateItem(editItemId, { label, description: desc || undefined });
    setEditItemId(null);
  };

  const openEditTrack = (track: PlanTrack) => {
    setTrackFormOpen(false);
    setItemFormTrackId(null);
    setEditItemId(null);
    setSelectedItemIds(new Set());
    setEditTitle(track.title);
    setEditDescription(track.description ?? "");
    setEditTrackId((cur) => (cur === track.id ? null : track.id));
  };

  const openEditItem = (item: PlanTrackItem) => {
    setTrackFormOpen(false);
    setItemFormTrackId(null);
    setEditTrackId(null);
    setSelectedItemIds(new Set());
    setEditItemLabel(item.label);
    setEditItemDescription(item.description ?? "");
    setEditItemId((cur) => (cur === item.id ? null : item.id));
  };

  const addTrackButtonEl = (extraClass?: string) => (
    <button
      ref={newTrackWrapRef}
      type="button"
      data-plan-compact-popover-anchor
      className={`${popoverStyles.trackAddBtn} ${trackFormOpen ? popoverStyles.trackAddBtnActive : ""} ${extraClass ?? ""}`.trim()}
      title="Add track"
      aria-expanded={trackFormOpen}
      aria-haspopup="dialog"
      aria-label="Add track"
      onClick={() => {
        setItemFormTrackId(null);
        setEditTrackId(null);
        setEditItemId(null);
        setSelectedItemIds(new Set());
        setTrackFormOpen((v) => !v);
      }}
    >
      <Plus size={16} strokeWidth={2} aria-hidden />
    </button>
  );

  const popoverLabel =
    formMode === "track"
      ? "New track"
      : formMode === "edit"
        ? "Edit track"
        : formMode === "item"
          ? "Add item"
          : formMode === "editItem"
            ? "Edit item"
            : "";

  const renderTrackRow = (track: PlanTrack) => {
    const trackItems = items.filter((i) => i.trackId === track.id);
    const itemBlocks = buildPlanItemDisplayBlocks(trackItems, itemGroups);
    const desc = track.description?.trim();
    const isDragging = draggingTrackId === track.id;
    const isDropTarget =
      dropTargetTrackId === track.id && draggingTrackId !== null && draggingTrackId !== track.id;

    const addItemButtonEl = (
      <button
        type="button"
        ref={(el) => {
          itemAddWrapRefs.current[track.id] = el;
        }}
        className={`${styles.addItemBtn} ${itemFormTrackId === track.id ? styles.addItemBtnActive : ""}`}
        aria-expanded={itemFormTrackId === track.id}
        aria-haspopup="dialog"
        data-plan-compact-popover-anchor
        aria-label={`Add item to ${track.title}`}
        onClick={() => {
          setEditTrackId(null);
          setEditItemId(null);
          setTrackFormOpen(false);
          setItemFormTrackId((cur) => (cur === track.id ? null : track.id));
        }}
      >
        <Plus size={14} strokeWidth={2} aria-hidden />
      </button>
    );

    const planItemDropEndEl = (
      <div
        className={`${styles.planItemDropEnd} ${planItemDropAppendTrackId === track.id ? styles.planItemDropEndActive : ""}`}
        onDragOver={(e) => {
          const dragId = draggingPlanItemIdRef.current;
          if (!dragId) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setPlanItemDropAppendTrackId(track.id);
          setPlanItemDropBeforeId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const raw =
            e.dataTransfer.getData(PLAN_TRACK_ITEM_MIME) || e.dataTransfer.getData("text/plain");
          draggingPlanItemIdRef.current = null;
          setDraggingPlanItemId(null);
          setPlanItemDropBeforeId(null);
          setPlanItemDropAppendTrackId(null);
          if (!raw) return;
          onMovePlanItem(raw, track.id, null);
        }}
        aria-hidden
      />
    );

    const canOpenItemGroupMenu = () => {
      if (selectedItemIds.size < 2) return false;
      const picked = trackItems.filter((i) => selectedItemIds.has(i.id));
      return picked.length >= 2;
    };

    return (
      <li
        key={track.id}
        className={`${styles.row} ${isDragging ? styles.rowDragging : ""} ${isDropTarget ? styles.rowDropTarget : ""}`}
        onDragOver={(e) => {
          if (!draggingTrackId || draggingTrackId === track.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTargetTrackId(track.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.getData(PLAN_TRACK_ITEM_MIME)) {
            return;
          }
          const draggedId = e.dataTransfer.getData("text/plain");
          setDropTargetTrackId(null);
          setDraggingTrackId(null);
          if (!draggedId || draggedId === track.id) return;
          const fromIndex = tracks.findIndex((t) => t.id === draggedId);
          const toIndex = tracks.findIndex((t) => t.id === track.id);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
          onReorderTracks(fromIndex, toIndex);
        }}
      >
        <div className={styles.trackLeft}>
          <button
            type="button"
            ref={(el) => {
              editTrackAnchorRefs.current[track.id] = el;
            }}
            data-plan-compact-popover-anchor
            draggable
            className={`${styles.trackChipBtn} ${editTrackId === track.id ? styles.trackChipBtnActive : ""}`}
            title={desc || undefined}
            aria-label={`Edit track ${track.title}`}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", track.id);
              e.dataTransfer.effectAllowed = "move";
              setDraggingTrackId(track.id);
              setSelectedItemIds(new Set());
            }}
            onDragEnd={() => {
              setDraggingTrackId(null);
              setDropTargetTrackId(null);
            }}
            aria-expanded={editTrackId === track.id}
            aria-haspopup="dialog"
            onClick={() => openEditTrack(track)}
          >
            {track.title}
          </button>
        </div>
        <div
          className={styles.items}
          onDragOver={(e) => {
            if (!draggingPlanItemIdRef.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (canOpenItemGroupMenu()) {
              setContextMenu({ x: e.clientX, y: e.clientY });
            }
          }}
        >
          <div className={styles.itemsWrap}>
            {itemBlocks.map((block, blockIdx) => {
              const isLastBlock = blockIdx === itemBlocks.length - 1;
              return (
              <div
                key={`${track.id}-${blockIdx}-${block.group?.id ?? "u"}-${block.items[0]?.id ?? blockIdx}`}
                className={`${styles.itemCluster} ${block.group ? styles.itemClusterLabeled : ""}`}
              >
                {block.group ? (
                  <div className={styles.itemClusterRail} title={block.group.title}>
                    <span className={styles.itemClusterLabel}>{block.group.title}</span>
                  </div>
                ) : null}
                <div className={styles.itemClusterChips}>
                  {block.items.map((item) => {
                    const itemDesc = item.description?.trim();
                    const isItemSelected = selectedItemIds.has(item.id);
                    const isItemChatActive = activeItemChatId === item.id;
                    const isFilteredOut = devOrderFilter != null && item.devOrder != null && item.devOrder > devOrderFilter;
                    const isDraggingChip = draggingPlanItemId === item.id;
                    const isDropBefore = planItemDropBeforeId === item.id;
                    const lastNote = item.lastNote?.trim();
                    const showHoverTooltip = Boolean(itemDesc) || Boolean(lastNote);
                    // Heat map: rank-based coloring
                    const HEAT_COLORS = ["#dc2626", "#ea580c", "#eab308"];
                    let heatStyle: React.CSSProperties | undefined;
                    if (heatMapEnabled) {
                      const rank = heatRankMap.get(item.id);
                      if (rank != null && rank < HEAT_COLORS.length) {
                        heatStyle = { borderLeft: `3px solid ${HEAT_COLORS[rank]}` };
                      }
                    }
                    const chipTitle = itemDesc
                      ? `${itemDesc} · Alt+click to edit`
                      : "Alt+click to edit label";
                    const ariaLabel = itemDesc ? `${item.label}. ${itemDesc}` : item.label;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        ref={(el) => {
                          editItemAnchorRefs.current[item.id] = el;
                        }}
                        className={`${styles.itemChip} ${editItemId === item.id ? styles.itemChipActive : ""} ${isItemSelected ? styles.itemChipSelected : ""} ${isItemChatActive ? styles.itemChipChatActive : ""} ${isDraggingChip ? styles.itemChipDragging : ""} ${isDropBefore ? styles.itemChipDropTarget : ""} ${isFilteredOut ? styles.itemChipDimmed : ""}`}
                        style={heatStyle}
                        aria-label={ariaLabel}
                        title={chipTitle}
                        data-plan-compact-popover-anchor
                        aria-pressed={isItemSelected}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(PLAN_TRACK_ITEM_MIME, item.id);
                          e.dataTransfer.effectAllowed = "copyMove";
                          draggingPlanItemIdRef.current = item.id;
                          setDraggingPlanItemId(item.id);
                          setPlanItemDropBeforeId(null);
                          setPlanItemDropAppendTrackId(null);
                          setSelectedItemIds(new Set());
                        }}
                        onDragEnd={() => {
                          draggingPlanItemIdRef.current = null;
                          setDraggingPlanItemId(null);
                          setPlanItemDropBeforeId(null);
                          setPlanItemDropAppendTrackId(null);
                        }}
                        onDragOver={(e) => {
                          const dragId = draggingPlanItemIdRef.current;
                          if (!dragId || dragId === item.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          setPlanItemDropBeforeId(item.id);
                          setPlanItemDropAppendTrackId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const raw =
                            e.dataTransfer.getData(PLAN_TRACK_ITEM_MIME) ||
                            e.dataTransfer.getData("text/plain");
                          draggingPlanItemIdRef.current = null;
                          setDraggingPlanItemId(null);
                          setPlanItemDropBeforeId(null);
                          setPlanItemDropAppendTrackId(null);
                          if (!raw || raw === item.id) return;
                          onMovePlanItem(raw, track.id, item.id);
                        }}
                        onClick={(e) => {
                          if (e.shiftKey && spaceKeyDownRef.current) {
                            e.preventDefault();
                            setSelectedItemIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                            return;
                          }
                          if (e.altKey) {
                            openEditItem(item);
                          } else if (onOpenItemDetail) {
                            onOpenItemDetail(item.id);
                          } else {
                            openEditItem(item);
                          }
                        }}
                      >
                        <span className={styles.itemChipRow}>
                          {devOrderEditItemId === item.id ? (
                            <input
                              ref={devOrderInputRef}
                              className={styles.devOrderInput}
                              value={devOrderDraft}
                              onChange={(e) => setDevOrderDraft(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const n = devOrderDraft.trim() === "" ? undefined : Number(devOrderDraft.trim());
                                  if (n !== undefined && (isNaN(n) || n < 0)) { setDevOrderEditItemId(null); return; }
                                  onUpdateDevOrder?.(item.id, n);
                                  setDevOrderEditItemId(null);
                                }
                                if (e.key === "Escape") {
                                  setDevOrderEditItemId(null);
                                }
                              }}
                              onBlur={() => {
                                const n = devOrderDraft.trim() === "" ? undefined : Number(devOrderDraft.trim());
                                if (n === undefined || (!isNaN(n) && n >= 0)) {
                                  onUpdateDevOrder?.(item.id, n);
                                }
                                setDevOrderEditItemId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              size={2}
                            />
                          ) : item.devOrder != null && item.devOrder > 0 ? (
                            <span
                              className={styles.devOrderBadge}
                              title={`Dev order: ${item.devOrder} — click to change`}
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDevOrderDraft(String(item.devOrder));
                                setDevOrderEditItemId(item.id);
                                requestAnimationFrame(() => devOrderInputRef.current?.select());
                              }}
                            >
                              {item.devOrder}.
                            </span>
                          ) : onUpdateDevOrder ? (
                            <span
                              className={styles.devOrderBadgeEmpty}
                              title="Set dev order"
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDevOrderDraft("");
                                setDevOrderEditItemId(item.id);
                                requestAnimationFrame(() => devOrderInputRef.current?.focus());
                              }}
                            >
                              #
                            </span>
                          ) : null}
                          <span className={styles.itemChipFace}>{item.label}</span>
                          {onOpenItemChat ? (
                            <span
                              role="button"
                              tabIndex={-1}
                              className={styles.itemChatBtn}
                              title="Open chat for this item"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenItemChat(item.id);
                              }}
                            >
                              <MessageCircle size={12} strokeWidth={2} />
                            </span>
                          ) : null}
                        </span>
                        {showHoverTooltip ? (
                          <span className={styles.itemChipTooltip} aria-hidden>
                            {lastNote ? (
                              <span className={styles.itemChipTooltipNote}>{lastNote}</span>
                            ) : null}
                            {itemDesc && itemDesc.length > 0 ? (
                              <span className={styles.itemChipTooltipDesc}>{itemDesc}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {isLastBlock ? addItemButtonEl : null}
                  {isLastBlock ? planItemDropEndEl : null}
                </div>
              </div>
              );
            })}
            {itemBlocks.length === 0 ? (
              <>
                {addItemButtonEl}
                {planItemDropEndEl}
              </>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.planHeader}>
        <h2 className={styles.planHeading}>Master Plan</h2>
        <div className={styles.planHeaderControls}>
          {hasAnyDevOrder && maxDevOrder > 1 ? (
            <div className={styles.devOrderSlider}>
              <input
                type="range"
                className={styles.devOrderRange}
                min={1}
                max={maxDevOrder + 1}
                value={devOrderFilter ?? maxDevOrder + 1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDevOrderFilter(v > maxDevOrder ? null : v);
                }}
              />
              <span className={styles.devOrderLabel}>
                {devOrderFilter == null ? "all" : devOrderFilter}
              </span>
            </div>
          ) : null}
          {onToggleHeatMap ? (
            <button
              type="button"
              className={`${styles.heatMapToggle} ${heatMapEnabled ? styles.heatMapToggleActive : ""}`}
              onClick={onToggleHeatMap}
              title={heatMapEnabled ? "Hide heat map" : "Show heat map"}
            >
              <Flame size={14} strokeWidth={2} />
            </button>
          ) : null}
          {versionCount != null && versionCount > 0 && onVersionNavigate ? (
            <div className={styles.timeMachine}>
              <button
                type="button"
                className={styles.timeMachineBtn}
                disabled={versionCount <= 0 || (versionIndex != null && versionIndex >= versionCount - 1)}
                onClick={() => onVersionNavigate(-1)}
                title="Older version"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <span className={`${styles.timeMachineLabel} ${isViewingHistory ? styles.timeMachineLabelActive : ""}`}>
                <Clock size={12} strokeWidth={2} />
                {isViewingHistory
                  ? `${(versionIndex ?? 0) + 1} / ${versionCount}`
                  : `${versionCount}`}
              </span>
              <button
                type="button"
                className={styles.timeMachineBtn}
                disabled={!isViewingHistory}
                onClick={() => onVersionNavigate(1)}
                title="Newer version"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {isViewingHistory ? (
        <div className={styles.historyBanner}>
          <span>Viewing historical version</span>
          {onRestoreVersion ? (
            <button
              type="button"
              className={styles.historyRestoreBtn}
              onClick={onRestoreVersion}
            >
              Restore this version
            </button>
          ) : null}
        </div>
      ) : null}
      {tracks.length === 0 ? (
        <div className={styles.emptyBlock}>
          {addTrackButtonEl(styles.emptyAddTrack)}
        </div>
      ) : (
        <>
          <ul className={styles.list} aria-label="Plan tracks and items">
            {tracks.map((track) => renderTrackRow(track))}
            <li className={styles.addTrackRow}>{addTrackButtonEl()}</li>
          </ul>
          {contextMenu ? (
            <div
              ref={contextMenuRef}
              className={styles.contextMenu}
              style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x }}
              role="menu"
              aria-label="Plan item actions"
            >
              <button
                type="button"
                role="menuitem"
                className={styles.contextMenuItem}
                onClick={() => {
                  setGroupDialogOpen(true);
                  setContextMenu(null);
                }}
              >
                Group plan items…
              </button>
            </div>
          ) : null}
          {groupDialogOpen ? (
            <div
              className={styles.groupDialogBackdrop}
              role="presentation"
              onClick={() => {
                setGroupDialogOpen(false);
                setGroupDialogName("");
              }}
            >
              <div
                className={styles.groupDialog}
                role="dialog"
                aria-labelledby={groupDialogHeadingId}
                onClick={(e) => e.stopPropagation()}
              >
                <p className={styles.groupDialogTitle} id={groupDialogHeadingId}>
                  New plan item group
                </p>
                <label className={styles.groupDialogLabel} htmlFor={groupDialogFieldId}>
                  Group label
                </label>
                <input
                  ref={groupDialogInputRef}
                  id={groupDialogFieldId}
                  className={styles.groupDialogInput}
                  value={groupDialogName}
                  onChange={(e) => setGroupDialogName(e.target.value)}
                  placeholder="e.g. Infrastructure"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = groupDialogName.trim();
                      if (!t) return;
                      onAssignItemsToGroup(Array.from(selectedItemIds), t);
                      setGroupDialogName("");
                      setGroupDialogOpen(false);
                      setSelectedItemIds(new Set());
                    }
                  }}
                />
                <div className={styles.groupDialogActions}>
                  <button
                    type="button"
                    className={styles.groupDialogBtnGhost}
                    onClick={() => {
                      setGroupDialogOpen(false);
                      setGroupDialogName("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.groupDialogBtnPrimary}
                    disabled={!groupDialogName.trim()}
                    onClick={() => {
                      const t = groupDialogName.trim();
                      if (!t) return;
                      onAssignItemsToGroup(Array.from(selectedItemIds), t);
                      setGroupDialogName("");
                      setGroupDialogOpen(false);
                      setSelectedItemIds(new Set());
                    }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {formMode && popoverPos ? (
        <div
          ref={popoverRef}
          className={`${popoverStyles.popover} ${formMode === "track" ? popoverStyles.popoverTrackPill : formMode === "item" ? popoverStyles.popoverItemAdd : ""}`.trim()}
          role="dialog"
          aria-label={popoverLabel}
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          {formMode === "track" ? (
            <form onSubmit={submitTrack} className={styles.trackAddNameForm}>
              <input
                ref={trackNameInputRef}
                id={trackNameId}
                className={`${styles.trackChipBtn} ${styles.trackChipBtnActive} ${styles.trackChipInput}`}
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                placeholder="Track name"
                autoComplete="off"
                aria-label="New track name"
              />
            </form>
          ) : formMode === "edit" ? (
            <form onSubmit={submitEditTrack}>
              <p className={popoverStyles.popoverTitle}>Edit track</p>
              <label className={popoverStyles.fieldLabel} htmlFor={editTitleId}>
                Track name
              </label>
              <input
                id={editTitleId}
                className={popoverStyles.input}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoComplete="off"
                autoFocus
                required
              />
              <label className={`${popoverStyles.fieldLabel} ${popoverStyles.fieldLabelSpaced}`} htmlFor={editDescId}>
                Description (optional)
              </label>
              <textarea
                id={editDescId}
                className={popoverStyles.textarea}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
              <div className={styles.editItemActions}>
                <button
                  type="button"
                  className={styles.btnRemoveItem}
                  onClick={() => {
                    if (editTrackId) onRemoveTrack(editTrackId);
                    setEditTrackId(null);
                  }}
                >
                  Delete track
                </button>
                <div className={styles.editItemActionsRight}>
                  <button
                    type="button"
                    className={popoverStyles.btnGhost}
                    onClick={() => setEditTrackId(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={popoverStyles.btnPrimary} disabled={!editTitle.trim()}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          ) : formMode === "editItem" ? (
            <form onSubmit={submitEditItem}>
              <p className={popoverStyles.popoverTitle}>Edit item</p>
              <label className={popoverStyles.fieldLabel} htmlFor={editItemLabelId}>
                Label
              </label>
              <input
                id={editItemLabelId}
                className={popoverStyles.input}
                value={editItemLabel}
                onChange={(e) => setEditItemLabel(e.target.value)}
                autoComplete="off"
                autoFocus
                required
              />
              <label
                className={`${popoverStyles.fieldLabel} ${popoverStyles.fieldLabelSpaced}`}
                htmlFor={editItemDescId}
              >
                Description (optional)
              </label>
              <textarea
                id={editItemDescId}
                className={popoverStyles.textarea}
                value={editItemDescription}
                onChange={(e) => setEditItemDescription(e.target.value)}
                rows={3}
              />
              <div className={styles.editItemActions}>
                <button
                  type="button"
                  className={styles.btnRemoveItem}
                  onClick={() => {
                    if (editItemId) onRemoveItem(editItemId);
                    setEditItemId(null);
                  }}
                >
                  Delete item
                </button>
                <div className={styles.editItemActionsRight}>
                  <button
                    type="button"
                    className={popoverStyles.btnGhost}
                    onClick={() => setEditItemId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={popoverStyles.btnPrimary}
                    disabled={!editItemLabel.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={submitItem} className={styles.itemAddNameForm}>
              <input
                ref={itemLabelInputRef}
                id={itemLabelId}
                className={`${styles.itemChip} ${styles.itemChipActive} ${styles.itemChipInput}`}
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder="Item name"
                autoComplete="off"
                aria-label="New plan item name"
              />
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
