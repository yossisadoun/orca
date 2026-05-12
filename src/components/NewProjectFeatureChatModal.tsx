import { Rocket, SendHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getDefaultParallelTodoPlan, type NewTodoPlanRow } from "../data/newTodoProjectPlan";
import styles from "./NewProjectFeatureChatModal.module.css";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

const planningPrompts = [
  "Who is the first audience — just you, a small team, or public launch?",
  "Do you need offline-first on day one, or is web online-only fine for v1?",
  "Should lists be purely personal, or do you want shared/collaborative lists early?",
  "Any must-have integration (calendar, email capture) we should reserve space for?",
  "What’s the narrowest first milestone: capture-only, single list, or multi-list from the start?",
];

function nextAssistantReply(index: number): string {
  return planningPrompts[index % planningPrompts.length];
}

let msgSeq = 0;
function nextMsgId(prefix: string) {
  msgSeq += 1;
  return `${prefix}-${msgSeq}`;
}

export function NewProjectFeatureChatModal({
  open,
  onClose,
  onApprove,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the ordered parallel plan; parent resets board (Features fill in on merge). */
  onApprove: (plan: NewTodoPlanRow[]) => void;
}) {
  const titleId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [userTurnIndex, setUserTurnIndex] = useState(0);
  const [plan, setPlan] = useState<NewTodoPlanRow[] | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      "Let’s shape a todo app you can build as parallel tracks. Share goals, constraints, or platforms — then click “Draft parallel plan” to turn this into an ordered feature list (each row is a separable workstream). When it looks right, Approve adds them to the Backlog; the Features panel will get tiles when you merge work from the board.";
    setMessages([{ id: nextMsgId("m"), role: "assistant", text: intro }]);
    setDraft("");
    setUserTurnIndex(0);
    setPlan(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

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

  const applyDraftPlan = () => {
    const next = getDefaultParallelTodoPlan();
    setPlan(next);
    setMessages((prev) => [
      ...prev,
      {
        id: nextMsgId("m"),
        role: "assistant",
        text: `Here’s ${next.length} parallel-friendly tracks in dev order. Each can move independently once you agree thin APIs between them (list identity, task row model, scheduling). Approve to load them into Backlog—Features tiles appear after merge.`,
      },
    ]);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((prev) => [...prev, { id: nextMsgId("m"), role: "user", text }]);
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
        data-new-project-chat-modal
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerIcon}>
              <Rocket size={20} strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <p className={styles.kicker}>New project</p>
              <h2 id={titleId} className={styles.title}>
                Plan Features for your todo app
              </h2>
              <p className={styles.subtitle}>
                Chat refines scope; the panel lists parallel workstreams in recommended order.
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.chatCol}>
            <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`${styles.msg} ${m.role === "user" ? styles.msgUser : styles.msgAssistant}`}
                >
                  <p className={styles.msgMeta}>{m.role === "user" ? "You" : "Planner"}</p>
                  <p className={styles.msgText}>{m.text}</p>
                </article>
              ))}
              <div ref={listEndRef} />
            </div>
            <div className={styles.composer}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                placeholder="MVP scope, platforms, or what “done” means…"
                value={draft}
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
                disabled={!draft.trim()}
                onClick={send}
              >
                <SendHorizontal size={20} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>

          <div className={styles.planCol}>
            <div className={styles.planHeader}>
              <p className={styles.planTitle}>Parallel feature tracks</p>
              <p className={styles.planHint}>
                Ordered for planning; teams can own slices concurrently with light contracts.
              </p>
              <div className={styles.planActions}>
                <button type="button" className={styles.draftBtn} onClick={applyDraftPlan}>
                  Draft parallel plan
                </button>
              </div>
            </div>
            {plan && plan.length > 0 ? (
              <ul className={styles.planList}>
                {plan.map((row) => (
                  <li key={`${row.ordinal}-${row.label}`} className={styles.planItem}>
                    <span className={styles.planOrdinal}>{row.ordinal}</span>
                    <div className={styles.planItemBody}>
                      <p className={styles.planLabel}>{row.label}</p>
                      <p className={styles.planDesc}>{row.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.planList}>
                <p className={styles.planEmpty}>
                  No plan yet — chat above, then use <strong>Draft parallel plan</strong> to fill this
                  list from a recommended todo-app breakdown.
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.approveBtn}
            disabled={!plan?.length}
            onClick={() => {
              if (plan?.length) onApprove(plan);
            }}
          >
            Approve — add to Backlog
          </button>
        </footer>
      </div>
    </div>
  );
}
