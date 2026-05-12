import { CheckCircle2, SendHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FeaturesetItem } from "../data/featureset";
import styles from "./ExtendSpecChatModal.module.css";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

const assistantPrompts = [
  "What edge cases or error states should we plan for?",
  "Who is the primary user for this change, and what’s their success criteria?",
  "Any dependencies on other features or launch timing we should note?",
  "Should we capture metrics or analytics for when this ships?",
];

function nextAssistantReply(index: number): string {
  return assistantPrompts[index % assistantPrompts.length];
}

let msgSeq = 0;
function nextMsgId(prefix: string) {
  msgSeq += 1;
  return `${prefix}-${msgSeq}`;
}

export type SpecChatModalMode = "extend" | "specify";

export function ExtendSpecChatModal({
  item,
  mode = "extend",
  open,
  onClose,
  onSpecResolved,
}: {
  item: FeaturesetItem;
  /** `extend` = Features catalog item; `specify` = backlog issue spec. */
  mode?: SpecChatModalMode;
  open: boolean;
  onClose: () => void;
  /** Fired once when the user first marks the spec resolved (per modal open). */
  onSpecResolved: () => void;
}) {
  const { label, description, icon: Icon } = item;
  const titleId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [specResolved, setSpecResolved] = useState(false);
  const [userTurnIndex, setUserTurnIndex] = useState(0);
  const listEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const specResolvedCommittedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      specResolvedCommittedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const intro =
      mode === "specify"
        ? `You’re specifying “${label}”. Use this thread to nail down intent, constraints, and acceptance criteria. Mark the spec resolved when this backlog item is ready to move into Todo.`
        : `You’re extending “${label}”. Use this thread to explain intent, constraints, and acceptance criteria. We’ll keep going until you mark the spec resolved.`;
    setMessages([{ id: nextMsgId("m"), role: "assistant", text: intro }]);
    setDraft("");
    setSpecResolved(false);
    setUserTurnIndex(0);
  }, [open, item.id, label, mode]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, item.id]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = () => {
    const text = draft.trim();
    if (!text || specResolved) return;
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { id: nextMsgId("m"), role: "user", text },
    ]);
    const turn = userTurnIndex;
    setUserTurnIndex((n) => n + 1);
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId("m"),
          role: "assistant",
          text: nextAssistantReply(turn),
        },
      ]);
    }, 380);
  };

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-extend-spec-modal
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerIcon}>
              <Icon size={20} strokeWidth={1.5} aria-hidden />
            </div>
            <div className={styles.headerCopy}>
              <p className={styles.kicker}>
                {mode === "specify" ? "Specify work" : "Extend feature"}
              </p>
              <h2 id={titleId} className={styles.title}>
                {label}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <div className={styles.contextStrip}>
          <p className={styles.contextLabel}>Attached context</p>
          <p className={styles.contextBody}>{description}</p>
        </div>

        <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`${styles.msg} ${m.role === "user" ? styles.msgUser : styles.msgAssistant}`}
            >
              <p className={styles.msgMeta}>{m.role === "user" ? "You" : "Spec chat"}</p>
              <p className={styles.msgText}>{m.text}</p>
            </article>
          ))}
          <div ref={listEndRef} />
        </div>

        <div className={styles.specBar}>
          <span
            className={`${styles.specStatus} ${specResolved ? styles.specStatusDone : ""}`}
          >
            {specResolved ? (
              <>
                <CheckCircle2
                  size={14}
                  strokeWidth={2}
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
                  aria-hidden
                />
                Spec marked resolved
              </>
            ) : (
              "Spec in progress — chat until you’re ready to lock it in."
            )}
          </span>
          <button
            type="button"
            className={styles.resolveBtn}
            onClick={() => {
              setSpecResolved((prev) => {
                const next = !prev;
                if (!prev && next && !specResolvedCommittedRef.current) {
                  specResolvedCommittedRef.current = true;
                  onSpecResolved();
                }
                return next;
              });
            }}
          >
            {specResolved ? "Continue editing spec" : "Mark spec resolved"}
          </button>
        </div>

        <div className={styles.composer}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={
              specResolved
                ? "Spec is resolved — choose “Continue editing spec” to add more."
                : "Explain what we should build or change…"
            }
            value={draft}
            disabled={specResolved}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
          />
          <button
            type="button"
            className={styles.sendBtn}
            aria-label="Send message"
            disabled={specResolved || !draft.trim()}
            onClick={send}
          >
            <SendHorizontal size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
