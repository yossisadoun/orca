import { useMemo } from "react";
import {
  buildAttentionThreads,
  groupAttentionThreads,
  type AttentionReason,
  type AttentionThread,
} from "../utils/attentionThreads";
import styles from "./AttentionInboxPanel.module.css";

function accentClass(reason: AttentionReason): string {
  switch (reason) {
    case "human_review":
      return styles.accentHuman;
    case "stuck":
      return styles.accentStuck;
    case "merge":
      return styles.accentMerge;
  }
}

export function AttentionInboxPanel({
  issues,
  selectedThreadKey,
  onSelectThread,
}: {
  issues: AttentionThread["issue"][];
  selectedThreadKey: string | null;
  onSelectThread: (thread: AttentionThread) => void;
}) {
  const threads = useMemo(() => buildAttentionThreads(issues), [issues]);
  const groups = useMemo(() => groupAttentionThreads(threads), [threads]);

  const toolbarMeta = useMemo(() => {
    if (threads.length === 0) return "Nothing queued";
    if (groups.length === 1 && threads.length === 1) return "1 ticket · 1 thread";
    return `${groups.length} ${groups.length === 1 ? "ticket" : "tickets"} · ${threads.length} ${threads.length === 1 ? "thread" : "threads"}`;
  }, [groups.length, threads.length]);

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <h2 className={styles.toolbarTitle}>Inbox</h2>
        <p className={styles.toolbarMeta}>{toolbarMeta}</p>
      </div>
      {threads.length === 0 ? (
        <p className={styles.empty}>Nothing needs your attention right now.</p>
      ) : (
        <ul className={styles.list} aria-label="Tickets needing attention">
          {groups.map(({ issue, threads: ticketThreads }) => (
            <li key={issue.id} className={styles.group}>
              <div className={styles.groupHeader}>
                <span className={styles.groupIssueId}>{issue.id}</span>
                <p className={styles.groupTitle}>{issue.title}</p>
              </div>
              <ul className={styles.groupThreadList}>
                {ticketThreads.map((thread) => {
                  const { reason, headline, preview, threadKey } = thread;
                  return (
                    <li key={threadKey} className={styles.groupThreadItem}>
                      <button
                        type="button"
                        className={`${styles.subRow} ${selectedThreadKey === threadKey ? styles.subRowSelected : ""}`}
                        onClick={() => onSelectThread(thread)}
                      >
                        <span
                          className={`${styles.accent} ${accentClass(reason)}`}
                          aria-hidden
                        />
                        <div className={styles.subBody}>
                          <div className={styles.subTop}>
                            <span className={styles.headline}>{headline}</span>
                          </div>
                          <p className={styles.preview}>{preview}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
