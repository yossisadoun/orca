import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { agentRoleMeta } from "../data/agentRoles";
import type { AttentionThread } from "../utils/attentionThreads";
import {
  compactStatusForInboxChat,
  openingHumanReviewMessage,
  openingMergeMessage,
  openingStuckMessage,
} from "../utils/inboxAgentChatCopy";
import styles from "./InboxAgentChatPanel.module.css";

function openingLineForThread(thread: AttentionThread): string {
  const { issue, reason, panelAgentRoleId } = thread;
  const title = issue.title;
  switch (reason) {
    case "stuck":
      return openingStuckMessage(panelAgentRoleId, title);
    case "human_review":
      return openingHumanReviewMessage(panelAgentRoleId, title);
    case "merge":
      return openingMergeMessage(title);
  }
}

export function InboxAgentChatPanel({
  thread,
  mergeProgress,
  onUnblockAgent,
  onOpenIssueDetails,
}: {
  thread: AttentionThread | null;
  mergeProgress?: number;
  onUnblockAgent: (issueId: string, roleId: AttentionThread["panelAgentRoleId"]) => void;
  onOpenIssueDetails: (issue: AttentionThread["issue"]) => void;
}) {
  const headerId = useId();
  const [draft, setDraft] = useState("");
  const [userLines, setUserLines] = useState<string[]>([]);

  const agentLabel = thread ? agentRoleMeta[thread.panelAgentRoleId].label : "";

  const statusLine = useMemo(() => {
    if (!thread) return "";
    return compactStatusForInboxChat(thread.reason, thread.preview, thread.issue.title);
  }, [thread]);

  const agentOpen = useMemo(() => (thread ? openingLineForThread(thread) : ""), [thread]);

  useEffect(() => {
    setUserLines([]);
    setDraft("");
  }, [thread?.threadKey]);

  const sendDraft = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setUserLines((lines) => [...lines, t]);
    setDraft("");
  }, [draft]);

  if (!thread) {
    return (
      <section className={styles.shell} aria-label="Conversation">
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Select a thread</p>
          <p className={styles.emptyHint}>Choose an item on the left to open the agent chat.</p>
        </div>
      </section>
    );
  }

  const { issue, reason, panelAgentRoleId } = thread;
  const stuck = reason === "stuck";
  const mergeActive = reason === "merge";
  const mergePct = mergeActive
    ? Math.round(Math.min(100, mergeProgress ?? 0))
    : null;

  return (
    <section className={styles.shell} aria-labelledby={headerId}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <p id={headerId} className={styles.title}>
            {agentLabel}
          </p>
          <span className={styles.issueRef}>
            {issue.id} · {issue.title}
          </span>
        </div>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => onOpenIssueDetails(issue)}
        >
          Issue details
        </button>
      </header>

      <div className={styles.status} role="status">
        <span className={styles.statusLabel}>{thread.headline}</span>
        <span className={styles.statusText}>{statusLine}</span>
      </div>

      {mergePct !== null ? (
        <div className={styles.mergeBar} aria-label={`Merge progress ${mergePct}%`}>
          <div className={styles.mergeTrack}>
            <div className={styles.mergeFill} style={{ width: `${mergePct}%` }} />
          </div>
          <span className={styles.mergeMeta}>{mergePct}%</span>
        </div>
      ) : null}

      <div className={styles.thread}>
        <div className={styles.bubbleAgent}>{agentOpen}</div>
        {userLines.map((line, i) => (
          <div key={`${i}-${line.slice(0, 12)}`} className={styles.bubbleUser}>
            {line}
          </div>
        ))}
      </div>

      <footer className={styles.footer}>
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            stuck
              ? "Reply — context, links, or a decision…"
              : "Add a note (demo) — optional reply in this thread…"
          }
          rows={2}
          disabled={mergeActive}
        />
        {stuck ? (
          <p className={styles.hint}>
            Unblocking returns the card to <strong>In progress</strong> for this agent.
          </p>
        ) : mergeActive ? (
          <p className={styles.hint}>Merge chat is read-only while the lane runs.</p>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={sendDraft}
            disabled={!draft.trim() || mergeActive}
          >
            Send
          </button>
          {stuck ? (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onUnblockAgent(issue.id, panelAgentRoleId)}
            >
              Unblock agent
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
