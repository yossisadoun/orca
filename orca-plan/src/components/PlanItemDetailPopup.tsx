import { MessageCircle, Square, CheckSquare, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanTrackItem, PlanTrack } from "../types";
import styles from "./PlanItemDetailPopup.module.css";

export function PlanItemDetailPopup({
  item,
  track,
  onClose,
  onUpdateItem,
  onToggleChecklistItem,
  onOpenChat,
}: {
  item: PlanTrackItem;
  track: PlanTrack | undefined;
  onClose: () => void;
  onUpdateItem: (itemId: string, payload: { label?: string; description?: string }) => void;
  onToggleChecklistItem: (itemId: string, checklistItemId: string, done: boolean) => void;
  onOpenChat?: (itemId: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState(item.description ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveDescription = useCallback(() => {
    onUpdateItem(item.id, { label: item.label, description: descDraft.trim() || undefined });
    setEditingDescription(false);
  }, [item.id, item.label, descDraft, onUpdateItem]);

  const checklist = item.checklist ?? [];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div
      className={styles.backdrop}
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={styles.popup}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {item.devOrder != null && item.devOrder > 0 ? (
              <span className={styles.devOrder}>{item.devOrder}.</span>
            ) : null}
            <h2 className={styles.title}>{item.label}</h2>
          </div>
          <div className={styles.headerActions}>
            {onOpenChat ? (
              <button
                type="button"
                className={styles.chatBtn}
                onClick={() => { onOpenChat(item.id); onClose(); }}
                title="Open chat for this item"
              >
                <MessageCircle size={15} strokeWidth={2} />
                Chat
              </button>
            ) : null}
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {track ? (
          <p className={styles.trackLabel}>Track: {track.title}</p>
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
              <textarea
                ref={textareaRef}
                className={styles.descTextarea}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setEditingDescription(false); setDescDraft(item.description ?? ""); }
                  if (e.key === "Enter" && e.metaKey) { e.preventDefault(); saveDescription(); }
                }}
                placeholder="Describe what this item involves..."
                autoFocus
              />
              <div className={styles.descActions}>
                <button type="button" className={styles.descSaveBtn} onClick={saveDescription}>Save</button>
                <button type="button" className={styles.descCancelBtn} onClick={() => { setEditingDescription(false); setDescDraft(item.description ?? ""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <p
              className={item.description ? styles.descText : styles.descEmpty}
              onClick={() => { setDescDraft(item.description ?? ""); setEditingDescription(true); }}
            >
              {item.description || "Click to add a description..."}
            </p>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.checklistHeader}>
            <h3 className={styles.sectionTitle}>Checklist</h3>
            {checklist.length > 0 ? (
              <span className={styles.checklistCount}>{doneCount}/{checklist.length}</span>
            ) : null}
          </div>
          {checklist.length > 0 ? (
            <ul className={styles.checklist}>
              {checklist.map((cl) => (
                <li key={cl.id} className={styles.checklistItem}>
                  <button
                    type="button"
                    className={styles.checklistToggle}
                    onClick={() => onToggleChecklistItem(item.id, cl.id, !cl.done)}
                  >
                    {cl.done ? (
                      <CheckSquare size={16} strokeWidth={2} className={styles.checklistIconDone} />
                    ) : (
                      <Square size={16} strokeWidth={2} className={styles.checklistIconTodo} />
                    )}
                  </button>
                  <span className={cl.done ? styles.checklistLabelDone : styles.checklistLabel}>
                    {cl.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.checklistEmpty}>
              No checklist yet. The agent can create one when planning this item.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
