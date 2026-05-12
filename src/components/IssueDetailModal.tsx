import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  List,
  MoreHorizontal,
  Paperclip,
  Play,
  Smile,
  Star,
  User,
} from "lucide-react";
import { useEffect, useId } from "react";
import type { Issue, IssueStatus } from "../types";
import { planDisplayNumbers } from "../utils/issuePlanLabels";
import { issueHasStuckAgent, issueStuckNeedsFromYouText } from "../utils/issueUtils";
import styles from "./IssueDetailModal.module.css";

const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  human_review: "Human Review",
  merge: "Merge",
};

export function IssueDetailModal({
  issue,
  open,
  index,
  total,
  onClose,
}: {
  issue: Issue | null;
  open: boolean;
  index: number;
  total: number;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || issue == null) return null;

  const plan = issue.plan ?? [];
  const nums = plan.length > 0 ? planDisplayNumbers(plan) : [];
  const description =
    issue.description ??
    "No description yet. Add context so collaborators know what \"done\" looks like.";

  return (
    <div className={styles.root}>
      <button type="button" className={styles.scrim} aria-label="Close dialog" onClick={onClose} />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.topBar}>
          <div className={styles.breadcrumb}>
            <span className={styles.crumb}>TODO App</span>
            <span className={styles.crumbSep} aria-hidden>
              ›
            </span>
            <span className={styles.crumbMuted} title={`${issue.id} ${issue.title}`}>
              {issue.id} {issue.title}
            </span>
          </div>
          <div className={styles.topActions}>
            <button type="button" className={styles.iconBtn} aria-label="Favorite">
              <Star size={18} strokeWidth={1.5} />
            </button>
            <button type="button" className={styles.iconBtn} aria-label="More options">
              <MoreHorizontal size={18} strokeWidth={1.5} />
            </button>
            <span className={styles.pageNav} aria-live="polite">
              <button type="button" className={styles.iconBtn} aria-label="Previous issue">
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <span className={styles.pageNavLabel}>
                {index + 1} / {total}
              </span>
              <button type="button" className={styles.iconBtn} aria-label="Next issue">
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </span>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        {issue.status === "human_review" && (
          <div className={styles.humanReviewVideo}>
            <button type="button" className={styles.humanReviewPlay} aria-label="Play feature video">
              <Play size={26} strokeWidth={1.35} className={styles.humanReviewPlayGlyph} />
            </button>
            <p className={styles.humanReviewVideoCaption}>here there will be a video</p>
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.main}>
            <h1 id={titleId} className={styles.title}>
              {issue.title}
            </h1>
            {issue.status === "in_progress" && issueHasStuckAgent(issue) ? (
              <div
                className={styles.humanAskCallout}
                role="note"
                aria-label={`Need from you: ${issueStuckNeedsFromYouText(issue)}`}
              >
                <span className={styles.humanAskCalloutLabel}>Need from you</span>
                <p className={styles.humanAskCalloutText}>
                  {issueStuckNeedsFromYouText(issue)}
                </p>
              </div>
            ) : null}
            <p className={styles.description}>{description}</p>

            <div className={styles.quickRow}>
              <button type="button" className={styles.quickIcon} aria-label="Add reaction">
                <Smile size={18} strokeWidth={1.5} />
              </button>
              <button type="button" className={styles.quickIcon} aria-label="Attach file">
                <Paperclip size={18} strokeWidth={1.5} />
              </button>
              <button type="button" className={styles.subIssueBtn}>
                + Add sub-issues
              </button>
            </div>

            <section className={styles.activitySection} aria-label="Activity">
              <div className={styles.activityHeader}>
                <h2 className={styles.sectionHeading}>Activity</h2>
                <button type="button" className={styles.unsubBtn}>
                  Unsubscribe
                </button>
              </div>
              <div className={styles.activityAvatars} aria-hidden>
                <span className={styles.avatar} />
                <span className={styles.avatar} />
              </div>
            </section>

            {plan.length > 0 ? (
              <section className={styles.planSection} aria-label="Plan">
                <h2 className={styles.planHeading}>Plan</h2>
                <ul className={styles.planList}>
                  {plan.map((item, i) => (
                    <li
                      key={item.id}
                      className={`${styles.planRow} ${item.depth > 0 ? styles.planRowNested : ""}`}
                    >
                      <span
                        className={`${styles.planCheck} ${item.done ? styles.planCheckDone : ""}`}
                        aria-hidden
                      >
                        {item.done ? <Check size={11} strokeWidth={2.5} /> : null}
                      </span>
                      <span className={styles.planNum}>{nums[i]}</span>
                      <span className={`${styles.planTitle} ${item.done ? styles.planTitleDone : ""}`}>
                        {item.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className={styles.sidebar} aria-label="Details">
            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>ID</span>
              <div className={styles.sideValueRow}>
                <span className={styles.sideMono}>{issue.id}</span>
                <button type="button" className={styles.sideIconBtn} aria-label="Copy link">
                  <Link2 size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Status</span>
              <button type="button" className={styles.statusSelect}>
                {issue.status === "in_progress" ? (
                  <Clock size={15} strokeWidth={1.5} className={styles.statusIconProgress} aria-hidden />
                ) : null}
                <span>{STATUS_LABEL[issue.status]}</span>
                <ChevronDown size={14} strokeWidth={1.5} className={styles.chev} aria-hidden />
              </button>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Priority</span>
              <button type="button" className={styles.sideField}>
                <MoreHorizontal size={15} strokeWidth={1.5} className={styles.sideFieldIcon} aria-hidden />
                <span>Set priority</span>
              </button>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Assignee</span>
              <button type="button" className={styles.sideField}>
                <User size={15} strokeWidth={1.5} className={styles.sideFieldIcon} aria-hidden />
                <span>Assign</span>
              </button>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Estimate</span>
              <button type="button" className={styles.sideField}>
                <AlertTriangle size={15} strokeWidth={1.5} className={styles.sideFieldIcon} aria-hidden />
                <span>Set estimate</span>
              </button>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Labels</span>
              <button type="button" className={styles.sideLink}>
                + Add label
              </button>
            </div>

            <div className={styles.sideRow}>
              <span className={styles.sideLabel}>Project</span>
              <div className={styles.sideValueRow}>
                <List size={15} strokeWidth={1.5} className={styles.sideFieldIcon} aria-hidden />
                <span>TODO App</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
