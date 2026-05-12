import { Bot, Check, X } from "lucide-react";
import { useRef, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { agentRoleMeta } from "../data/agentRoles";
import type { AgentRoleId, Issue } from "../types";
import { issueHasStuckAgent, issueStuckNeedsFromYouText } from "../utils/issueUtils";
import styles from "./IssueCard.module.css";

const AGENT_RING_CIRC = 2 * Math.PI * 12;

function defaultAgentProgress(roleId: AgentRoleId, issueId: string): number {
  const n = (issueId.codePointAt(issueId.length - 1) ?? 48) + roleId.length * 3;
  return 28 + (n % 13);
}

function agentSlotTitle(roleId: AgentRoleId, issue: Issue): string {
  const { label } = agentRoleMeta[roleId];
  const w = issue.agentWork?.[roleId];
  if (w?.stuck) return `${label}: stuck`;
  if (w?.complete) return `${label}: done`;
  const pct = w?.progress ?? defaultAgentProgress(roleId, issue.id);
  return `${label}: ${pct}%`;
}

const agentRoleIconClass: Record<AgentRoleId, string> = {
  ui_ux_designer: styles.agentUiUx,
  engineer: styles.agentEng,
  product: styles.agentProduct,
  qa: styles.agentQa,
  writer: styles.agentWriter,
};

export function IssueCard({
  issue,
  showAgents = false,
  cardMenuDisabled = false,
  mergeProgress,
  onMenuRequest,
  onStuckAgentClick,
  dragFromBacklog = false,
  onBacklogDragTransportStart,
  onBacklogDragTransportEnd,
}: {
  issue: Issue;
  showAgents?: boolean;
  /** When true, card does not open the context menu (e.g. merge in flight). */
  cardMenuDisabled?: boolean;
  /** 0–100 merge animation; when set with status merge, shows progress toward Features. */
  mergeProgress?: number;
  onMenuRequest?: (issue: Issue, clientX: number, clientY: number) => void;
  /** Opens stuck-agent chat when the user activates a stuck (red X) avatar. */
  onStuckAgentClick?: (issue: Issue, roleId: AgentRoleId, clientX: number, clientY: number) => void;
  /** When true (Backlog column), card can be dragged to Todo. */
  dragFromBacklog?: boolean;
  onBacklogDragTransportStart?: (issueId: string) => void;
  onBacklogDragTransportEnd?: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const agents = showAgents && issue.agents && issue.agents.length > 0 ? issue.agents : null;
  const agentLabels = agents?.map((id) => agentSlotTitle(id, issue)).join(", ");
  const menuEnabled = Boolean(onMenuRequest) && !cardMenuDisabled;
  const showMergeBar =
    issue.status === "merge" && mergeProgress !== undefined && mergeProgress < 100;
  const mergeCompleteBar =
    issue.status === "merge" && mergeProgress !== undefined && mergeProgress >= 100;
  const showMergeAgent =
    issue.status === "merge" && mergeProgress !== undefined;
  const mergeAgentWorking = showMergeAgent && mergeProgress < 100;
  const mergeAgentDone = showMergeAgent && mergeProgress >= 100;
  const stuckNeedsYou =
    issue.status === "in_progress" && issueHasStuckAgent(issue);

  const openMenu = (clientX: number, clientY: number) => {
    onMenuRequest?.(issue, clientX, clientY);
  };

  const onCardClick = (e: MouseEvent) => {
    if (!menuEnabled) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  const onCardKeyDown = (e: KeyboardEvent) => {
    if (!menuEnabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const r = cardRef.current?.getBoundingClientRect();
      const x = (r?.left ?? 0) + 12;
      const y = (r?.bottom ?? 0) + 4;
      openMenu(x, y);
    }
  };

  const dragActive = dragFromBacklog && !cardMenuDisabled;
  const onDragStart = (e: DragEvent<HTMLElement>) => {
    if (!dragActive) return;
    e.dataTransfer.setData("application/x-orca-issue-id", issue.id);
    e.dataTransfer.setData("text/plain", issue.id);
    e.dataTransfer.effectAllowed = "move";
    onBacklogDragTransportStart?.(issue.id);
  };

  const onDragEnd = () => {
    if (!dragActive) return;
    onBacklogDragTransportEnd?.();
  };

  return (
    <article
      ref={cardRef}
      className={`${styles.card} ${menuEnabled ? styles.cardInteractive : ""} ${dragActive ? styles.cardDraggableFromBacklog : ""}`}
      aria-busy={showMergeBar || undefined}
      {...(menuEnabled
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-haspopup": "menu" as const,
            onClick: onCardClick,
            onKeyDown: onCardKeyDown,
          }
        : {})}
      {...(dragActive
        ? {
            draggable: true,
            onDragStart,
            onDragEnd,
          }
        : {})}
    >
      <div className={styles.top}>
        {issue.variant === "blocked" && (
          <span className={styles.badgeBlocked} title="Blocked" aria-hidden>
            −
          </span>
        )}
        {issue.variant === "highlight" && (
          <span className={styles.badgeDot} title="Picked up" aria-hidden />
        )}
        <span className={styles.id}>{issue.id}</span>
      </div>
      <h3 className={styles.title}>{issue.title}</h3>
      {stuckNeedsYou ? (
        <div
          className={styles.humanAskBanner}
          role="note"
          aria-label={`Need from you: ${issueStuckNeedsFromYouText(issue)}`}
        >
          <span className={styles.humanAskLabel}>Need from you</span>
          <p className={styles.humanAskText}>{issueStuckNeedsFromYouText(issue)}</p>
        </div>
      ) : null}
      {showMergeAgent ? (
        <div
          className={styles.agents}
          aria-label={
            mergeAgentDone ? "Merged into Features" : "Merging into Features"
          }
        >
          <span
            className={`${styles.agentSlot} ${styles.agentMerge} ${mergeAgentDone ? styles.agentSlotComplete : ""}`}
            title={mergeAgentDone ? "Merged into Features" : "Merging into Features…"}
          >
            <svg className={styles.agentRingSvg} viewBox="0 0 32 32" aria-hidden>
              <circle className={styles.agentRingBg} cx="16" cy="16" r="12" fill="none" />
              {mergeAgentWorking ? (
                <g transform="translate(16 16)">
                  <g className={styles.agentRingSpinnerGroup}>
                    <circle
                      className={styles.agentRingSpinnerMarker}
                      cx={0}
                      cy={0}
                      r={12}
                      fill="none"
                      strokeLinecap="round"
                      strokeWidth={2.5}
                      strokeDasharray={`${8.2} ${AGENT_RING_CIRC - 8.2}`}
                      transform="rotate(-90)"
                    />
                  </g>
                </g>
              ) : null}
            </svg>
            <span className={styles.agentSlotInner}>
              {mergeAgentDone ? (
                <Check size={14} strokeWidth={2.5} className={styles.agentStateCheck} aria-hidden />
              ) : (
                <Bot size={12} strokeWidth={1.75} aria-hidden />
              )}
            </span>
          </span>
        </div>
      ) : null}
      {agents && (
        <div
          className={styles.agents}
          aria-label={agentLabels ? `Agents: ${agentLabels}` : undefined}
        >
          {agents.map((roleId) => {
            const work = issue.agentWork?.[roleId];
            const stuck = Boolean(work?.stuck);
            const complete = Boolean(work?.complete);
            const showRing = !complete && !stuck;
            const stuckClickable = Boolean(stuck && onStuckAgentClick);
            const openStuck = (clientX: number, clientY: number) => {
              onStuckAgentClick?.(issue, roleId, clientX, clientY);
            };
            return (
              <span
                key={roleId}
                role={stuckClickable ? "button" : undefined}
                tabIndex={stuckClickable ? 0 : undefined}
                className={`${styles.agentSlot} ${agentRoleIconClass[roleId]} ${stuck ? styles.agentSlotStuck : ""} ${complete ? styles.agentSlotComplete : ""} ${stuckClickable ? styles.agentSlotStuckInteractive : ""}`}
                title={agentSlotTitle(roleId, issue)}
                aria-label={stuckClickable ? `${agentRoleMeta[roleId].label} stuck — open chat to unblock` : undefined}
                onClick={
                  stuckClickable
                    ? (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        openStuck(e.clientX, e.clientY);
                      }
                    : undefined
                }
                onKeyDown={
                  stuckClickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openStuck(r.left + r.width / 2, r.bottom + 4);
                        }
                      }
                    : undefined
                }
              >
                <svg className={styles.agentRingSvg} viewBox="0 0 32 32" aria-hidden>
                  <circle className={styles.agentRingBg} cx="16" cy="16" r="12" fill="none" />
                  {showRing ? (
                    <g transform="translate(16 16)">
                      <g className={styles.agentRingSpinnerGroup}>
                        <circle
                          className={styles.agentRingSpinnerMarker}
                          cx={0}
                          cy={0}
                          r={12}
                          fill="none"
                          strokeLinecap="round"
                          strokeWidth={2.5}
                          strokeDasharray={`${8.2} ${AGENT_RING_CIRC - 8.2}`}
                          transform="rotate(-90)"
                        />
                      </g>
                    </g>
                  ) : null}
                </svg>
                <span className={styles.agentSlotInner}>
                  {stuck ? (
                    <X size={14} strokeWidth={2.5} className={styles.agentStateX} aria-hidden />
                  ) : complete ? (
                    <Check size={14} strokeWidth={2.5} className={styles.agentStateCheck} aria-hidden />
                  ) : (
                    <Bot size={12} strokeWidth={1.75} aria-hidden />
                  )}
                </span>
              </span>
            );
          })}
        </div>
      )}
      <p className={styles.meta}>{issue.updatedLabel}</p>
      {showMergeBar ? (
        <div className={styles.mergeProgress} aria-live="polite">
          <div className={styles.mergeProgressLabel}>Merging into Features…</div>
          <div className={styles.mergeProgressTrack}>
            <div
              className={styles.mergeProgressFill}
              style={{ width: `${Math.min(100, mergeProgress ?? 0)}%` }}
            />
          </div>
        </div>
      ) : null}
      {mergeCompleteBar ? (
        <div className={styles.mergeProgress} aria-live="polite">
          <div className={styles.mergeProgressLabelSuccess}>Merged</div>
          <div className={styles.mergeProgressTrack}>
            <div className={`${styles.mergeProgressFill} ${styles.mergeProgressFillDone}`} />
          </div>
        </div>
      ) : null}
    </article>
  );
}
