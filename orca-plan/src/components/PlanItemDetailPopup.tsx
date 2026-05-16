import { Check, CheckSquare, Circle, Eye, Loader, MessageCircle, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanProjectSnapshot, PlanTrackItem, PlanTrack } from "../types";
import { ClaudeAgentPanel } from "./ClaudeAgentPanel";
import styles from "./PlanItemDetailPopup.module.css";

type ItemStatus = "backlog" | "in_progress" | "review" | "done";
const STATUS_ORDER: ItemStatus[] = ["backlog", "in_progress", "review", "done"];
const STATUS_META: Record<ItemStatus, { label: string; icon: React.ReactNode; className: string }> = {
  backlog: { label: "Backlog", icon: <Circle size={14} strokeWidth={2} />, className: "statusBacklog" },
  in_progress: { label: "In progress", icon: <Loader size={14} strokeWidth={2} />, className: "statusInProgress" },
  review: { label: "Review", icon: <Eye size={14} strokeWidth={2} />, className: "statusReview" },
  done: { label: "Done", icon: <Check size={14} strokeWidth={2.5} />, className: "statusDone" },
};

const VIDEO_EXTS = [".webm", ".mp4", ".mov"];
function isVideoPath(p: string) { return VIDEO_EXTS.some((ext) => p.toLowerCase().endsWith(ext)); }

function ScreenshotThumb({ workspaceRoot, relativePath, label }: { workspaceRoot: string; relativePath: string; label?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const fn = window.orcaPlan?.readScreenshot;
    if (!fn) return;
    void fn(workspaceRoot, relativePath).then((raw: unknown) => {
      if (raw && typeof raw === "object" && "ok" in raw && (raw as { ok: unknown }).ok === true) {
        setDataUrl((raw as { dataUrl: string }).dataUrl);
      }
    });
  }, [workspaceRoot, relativePath]);

  if (isVideoPath(relativePath)) {
    return (
      <button type="button" className={styles.galleryVideoBtn} onClick={(e) => { e.stopPropagation(); void window.orcaPlan?.revealWorkspacePath?.(workspaceRoot, relativePath); }}>
        <span className={styles.galleryVideoIcon}>▶</span>
        <span className={styles.galleryLabel}>{label || "Recording"}</span>
      </button>
    );
  }
  if (!dataUrl) return <div className={styles.galleryPlaceholder} />;
  return (
    <>
      <div className={styles.galleryItem} onClick={() => setExpanded(true)}>
        <img src={dataUrl} alt={label || "Evidence"} className={styles.galleryImg} />
        {label ? <span className={styles.galleryLabel}>{label}</span> : null}
      </div>
      {expanded ? (
        <div className={styles.evidenceOverlay} onClick={() => setExpanded(false)}>
          <img src={dataUrl} alt={label || "Evidence"} className={styles.evidenceFull} />
        </div>
      ) : null}
    </>
  );
}

export function PlanItemDetailPopup({
  item,
  track,
  wave,
  workspaceRoot,
  snapshot,
  github,
  onClose,
  onUpdateItem,
  onToggleChecklistItem,
  onUpdateStatus,
  onDeleteItem,
  onSessionDetected,
}: {
  item: PlanTrackItem;
  track: PlanTrack | undefined;
  wave?: number;
  workspaceRoot?: string;
  snapshot?: PlanProjectSnapshot;
  github?: { owner: string; repo: string; defaultBranch: string };
  onClose: () => void;
  onUpdateItem: (itemId: string, payload: { label?: string; description?: string }) => void;
  onToggleChecklistItem: (itemId: string, checklistItemId: string, done: boolean) => void;
  onUpdateStatus?: (itemId: string, status: ItemStatus) => void;
  onDeleteItem?: (itemId: string) => void;
  onSessionDetected?: (sessionId: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState(item.description ?? "");
  const [showChat, setShowChat] = useState(Boolean(workspaceRoot && snapshot));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveDescription = useCallback(() => {
    onUpdateItem(item.id, { label: item.label, description: descDraft.trim() || undefined });
    setEditingDescription(false);
  }, [item.id, item.label, descDraft, onUpdateItem]);

  const checklist = item.checklist ?? [];
  const doneCount = checklist.filter((c) => c.done).length;
  const evidenceItems = checklist.filter((c) => c.evidence);

  return (
    <div className={styles.backdrop} ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className={`${styles.popup} ${showChat ? styles.popupWithChat : ""}`}>
        {/* Left: item details */}
        <div className={styles.detailPane}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              {wave != null && wave !== Infinity ? <span className={styles.waveBadge}>W{wave}</span> : null}
              <h2 className={styles.title}>{item.label}</h2>
            </div>
            <div className={styles.headerActions}>
              {workspaceRoot && snapshot ? (
                <button type="button" className={`${styles.chatToggleBtn} ${showChat ? styles.chatToggleBtnActive : ""}`} onClick={() => setShowChat((v) => !v)} title={showChat ? "Hide chat" : "Show chat"}>
                  <MessageCircle size={15} strokeWidth={2} />
                </button>
              ) : null}
              <button type="button" className={styles.closeBtn} onClick={onClose}><X size={16} strokeWidth={2} /></button>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.metaRow}>
              {track ? <span className={styles.metaItem}>Track: {track.title}</span> : null}
            </div>

            {onUpdateStatus ? (
              <div className={styles.statusRow}>
                {STATUS_ORDER.map((s) => {
                  const meta = STATUS_META[s];
                  const isActive = (item.status || "backlog") === s;
                  return (
                    <button key={s} type="button" className={`${styles.statusBtn} ${isActive ? styles[meta.className] : ""}`} onClick={() => onUpdateStatus(item.id, s)}>
                      {meta.icon} {meta.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {item.lastNote ? (
              <div className={styles.lastNote}>
                <span className={styles.lastNoteLabel}>Last status:</span> {item.lastNote}
              </div>
            ) : null}

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Description</h3>
              {editingDescription ? (
                <div className={styles.descEditor}>
                  <textarea ref={undefined} className={styles.descTextarea} value={descDraft} onChange={(e) => setDescDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingDescription(false); setDescDraft(item.description ?? ""); } if (e.key === "Enter" && e.metaKey) { e.preventDefault(); saveDescription(); } }}
                    placeholder="Describe what this item involves..." autoFocus />
                  <div className={styles.descActions}>
                    <button type="button" className={styles.descSaveBtn} onClick={saveDescription}>Save</button>
                    <button type="button" className={styles.descCancelBtn} onClick={() => { setEditingDescription(false); setDescDraft(item.description ?? ""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className={item.description ? styles.descText : styles.descEmpty} onClick={() => { setDescDraft(item.description ?? ""); setEditingDescription(true); }}>
                  {item.description || "Click to add a description..."}
                </p>
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Checklist</h3>
                {checklist.length > 0 ? <span className={styles.checklistCount}>{doneCount}/{checklist.length}</span> : null}
              </div>
              {checklist.length > 0 ? (
                <ul className={styles.checklist}>
                  {checklist.map((cl) => (
                    <li key={cl.id} className={styles.checklistItem}>
                      <button type="button" className={styles.checklistToggle} onClick={() => onToggleChecklistItem(item.id, cl.id, !cl.done)}>
                        {cl.done ? <CheckSquare size={16} strokeWidth={2} className={styles.checkDone} /> : <Square size={16} strokeWidth={2} className={styles.checkTodo} />}
                      </button>
                      <span className={cl.done ? styles.checkLabelDone : styles.checkLabel}>{cl.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyHint}>No checklist yet. The agent creates one when planning this item.</p>
              )}
            </div>

            {evidenceItems.length > 0 && workspaceRoot ? (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Evidence</h3>
                <div className={styles.gallery}>
                  {evidenceItems.map((cl) => (
                    <ScreenshotThumb key={cl.id} workspaceRoot={workspaceRoot} relativePath={cl.evidence!} label={cl.label} />
                  ))}
                </div>
              </div>
            ) : null}

            {onDeleteItem ? (
              <div className={styles.dangerSection}>
                <button type="button" className={styles.deleteBtn} onClick={() => { onDeleteItem(item.id); onClose(); }}>Delete item</button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: chat */}
        {showChat && workspaceRoot && snapshot ? (
          <div className={styles.chatPane}>
            <ClaudeAgentPanel
              key={`item-${item.id}`}
              workspaceRoot={workspaceRoot}
              snapshot={snapshot}
              activeItem={item}
              github={github}
              onSessionDetected={onSessionDetected}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
