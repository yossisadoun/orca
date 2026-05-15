import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import type { ReleaseLogEntry } from "../types";
import { nextId } from "../utils/persistence";
import styles from "./ReleaseLog.module.css";

export function ReleaseLog({
  entries,
  onUpdate,
}: {
  entries: ReleaseLogEntry[];
  onUpdate: (entries: ReleaseLogEntry[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingLabel, setAddingLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const unreleased = entries.filter((e) => !e.released);
  const released = entries.filter((e) => e.released);

  const addEntry = useCallback(() => {
    const label = addingLabel.trim();
    if (!label) return;
    onUpdate([...entries, {
      id: nextId("rl"),
      label,
      addedAt: new Date().toISOString(),
      released: false,
    }]);
    setAddingLabel("");
    setShowAddForm(false);
  }, [addingLabel, entries, onUpdate]);

  const removeEntry = useCallback((id: string) => {
    onUpdate(entries.filter((e) => e.id !== id));
  }, [entries, onUpdate]);

  const editLabel = useCallback((id: string, label: string) => {
    onUpdate(entries.map((e) => e.id === id ? { ...e, label } : e));
  }, [entries, onUpdate]);

  if (entries.length === 0 && !showAddForm) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </button>
        <h3 className={styles.heading}>
          Plan Log
          {unreleased.length > 0 ? <span className={styles.badge}>{unreleased.length}</span> : null}
        </h3>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setShowAddForm(true)}
            title="Add entry"
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className={styles.body}>
          {showAddForm ? (
            <div className={styles.addForm}>
              <input
                className={styles.addInput}
                value={addingLabel}
                onChange={(e) => setAddingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addEntry(); }
                  if (e.key === "Escape") { setShowAddForm(false); setAddingLabel(""); }
                }}
                placeholder="What changed?"
                autoFocus
              />
            </div>
          ) : null}
          {unreleased.length > 0 ? (
            <ul className={styles.list}>
              {unreleased.map((entry) => (
                <li key={entry.id} className={styles.entry}>
                  <span className={styles.dot} />
                  <span
                    className={styles.entryLabel}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const text = (e.target as HTMLElement).textContent?.trim() ?? "";
                      if (text && text !== entry.label) editLabel(entry.id, text);
                    }}
                  >
                    {entry.label}
                  </span>
                  <span className={styles.entryTime}>
                    {new Date(entry.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeEntry(entry.id)}
                    title="Remove"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {released.length > 0 ? (
            <details className={styles.releasedSection}>
              <summary className={styles.releasedSummary}>
                {released.length} released
              </summary>
              <ul className={styles.list}>
                {released.map((entry) => (
                  <li key={entry.id} className={`${styles.entry} ${styles.entryReleased}`}>
                    <span className={styles.dotReleased} />
                    <span className={styles.entryLabel}>{entry.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
