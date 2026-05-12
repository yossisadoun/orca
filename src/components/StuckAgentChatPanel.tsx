import { X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { agentRoleMeta } from "../data/agentRoles";
import type { AgentRoleId } from "../types";
import { openingStuckMessage } from "../utils/inboxAgentChatCopy";
import styles from "./StuckAgentChatPanel.module.css";

export function StuckAgentChatPanel({
  issueId,
  issueTitle,
  roleId,
  anchorLeft,
  anchorTop,
  onClose,
  onUnblock,
}: {
  issueId: string;
  issueTitle: string;
  roleId: AgentRoleId;
  anchorLeft: number;
  anchorTop: number;
  onClose: () => void;
  onUnblock: () => void;
}) {
  const label = agentRoleMeta[roleId].label;
  const headerId = useId();
  const [draft, setDraft] = useState("");
  const [userLines, setUserLines] = useState<string[]>([]);

  const agentOpen = useMemo(() => openingStuckMessage(roleId, issueTitle), [roleId, issueTitle]);

  const sendDraft = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setUserLines((lines) => [...lines, t]);
    setDraft("");
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className={styles.backdrop} aria-label="Close chat" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headerId}
        className={styles.panel}
        data-stuck-agent-panel
        style={{ left: anchorLeft, top: anchorTop }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p id={headerId} className={styles.title}>
              Chat with {label}
            </p>
            <span className={styles.issueRef}>
              {issueId} · {issueTitle}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className={styles.thread}>
          <div className={styles.bubbleAgent}>{agentOpen}</div>
          {userLines.map((line, i) => (
            <div key={`${i}-${line.slice(0, 12)}`} className={styles.bubbleUser}>
              {line}
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <textarea
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply — unblock with context, links, or a decision…"
            rows={2}
          />
          <p className={styles.hint}>
            When you unblock, the card returns to <strong>In progress</strong> and this agent will run to completion.
          </p>
          <div className={styles.row}>
            <button type="button" className={styles.btnSecondary} onClick={sendDraft}>
              Send
            </button>
            <button type="button" className={styles.btnPrimary} onClick={onUnblock}>
              Unblock agent
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
