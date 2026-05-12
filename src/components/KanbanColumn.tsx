import { useEffect, useState, type DragEvent } from "react";
import type { AgentRoleId, BoardColumn, Issue, IssueStatus } from "../types";
import { ColumnHeaderIcon, IconDots, IconPlus } from "./icons";
import { IssueCard } from "./IssueCard";
import { JumpingRobot } from "./JumpingRobot";
import { ReadyRobot } from "./ReadyRobot";
import styles from "./KanbanColumn.module.css";

export type BacklogTodoDragConfig = {
  draggingIssueId: string | null;
  onBacklogDragStart: (issueId: string) => void;
  onBacklogDragEnd: () => void;
  onDropBacklogOnTodo: (issueId: string) => void;
};

export function KanbanColumnView({
  column,
  items,
  mergeProgressById = {},
  onIssueMenuRequest,
  onStuckAgentClick,
  backlogTodoDrag,
}: {
  column: BoardColumn;
  items: Issue[];
  /** 0–100 while a card is animating merge → Features; omit for no bar. */
  mergeProgressById?: Record<string, number>;
  onIssueMenuRequest?: (issue: Issue, clientX: number, clientY: number) => void;
  onStuckAgentClick?: (issue: Issue, roleId: AgentRoleId, clientX: number, clientY: number) => void;
  /** Drag backlog cards into the Todo column (HTML5 DnD). */
  backlogTodoDrag?: BacklogTodoDragConfig;
}) {
  const [todoDragOver, setTodoDragOver] = useState(false);
  const btd = backlogTodoDrag;
  const isTodo = column.id === "todo";
  const isBacklog = column.id === "backlog";

  useEffect(() => {
    if (!btd?.draggingIssueId) setTodoDragOver(false);
  }, [btd?.draggingIssueId]);

  const onTodoDragOver =
    isTodo && btd
      ? (e: DragEvent) => {
          if (!btd.draggingIssueId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      : undefined;

  const onTodoDragEnter =
    isTodo && btd
      ? (e: DragEvent) => {
          if (!btd.draggingIssueId) return;
          e.preventDefault();
          setTodoDragOver(true);
        }
      : undefined;

  const onTodoDragLeave =
    isTodo && btd
      ? (e: DragEvent) => {
          const t = e.currentTarget;
          const rel = e.relatedTarget as Node | null;
          if (!rel || !t.contains(rel)) setTodoDragOver(false);
        }
      : undefined;

  const onTodoDrop =
    isTodo && btd
      ? (e: DragEvent) => {
          e.preventDefault();
          setTodoDragOver(false);
          const id =
            e.dataTransfer.getData("application/x-orca-issue-id") ||
            e.dataTransfer.getData("text/plain");
          if (id) btd.onDropBacklogOnTodo(id.trim());
          btd.onBacklogDragEnd();
        }
      : undefined;

  const columnClass = [
    styles.column,
    isTodo && btd?.draggingIssueId ? styles.columnTodoDropReady : "",
    isTodo && todoDragOver ? styles.columnTodoDropActive : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={columnClass}
      aria-label={column.title}
      {...(isTodo && btd
        ? {
            onDragOver: onTodoDragOver,
            onDragEnter: onTodoDragEnter,
            onDragLeave: onTodoDragLeave,
            onDrop: onTodoDrop,
          }
        : {})}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <ColumnHeaderIcon variant={column.headerVariant} />
        </span>
        <h2 className={styles.heading}>{column.title}</h2>
        <span className={styles.count}>{items.length}</span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconBtn} aria-label={`More for ${column.title}`}>
            <IconDots />
          </button>
          <button type="button" className={styles.iconBtn} aria-label={`New issue in ${column.title}`}>
            <IconPlus />
          </button>
        </div>
      </header>
      <ul className={styles.list}>
        {items.map((issue) => (
          <li key={issue.id}>
            <IssueCard
              issue={issue}
              showAgents={column.id === "in_progress" || column.id === "human_review"}
              cardMenuDisabled={Boolean(
                issue.status === "merge" &&
                  mergeProgressById[issue.id] !== undefined &&
                  mergeProgressById[issue.id] < 100,
              )}
              mergeProgress={mergeProgressById[issue.id]}
              onMenuRequest={onIssueMenuRequest}
              onStuckAgentClick={onStuckAgentClick}
              dragFromBacklog={isBacklog && Boolean(btd)}
              onBacklogDragTransportStart={btd?.onBacklogDragStart}
              onBacklogDragTransportEnd={btd?.onBacklogDragEnd}
            />
          </li>
        ))}
      </ul>
      {column.id === "in_progress" ? <JumpingRobot /> : null}
      {column.id === "human_review" ? <ReadyRobot /> : null}
      <button type="button" className={styles.addRow} aria-label={`Add issue to ${column.title}`}>
        <span className={styles.addPlus}>
          <IconPlus />
        </span>
      </button>
    </section>
  );
}

export function groupIssuesByStatus(
  all: Issue[],
  visible: IssueStatus[],
): Map<IssueStatus, Issue[]> {
  const map = new Map<IssueStatus, Issue[]>();
  for (const id of visible) map.set(id, []);
  for (const issue of all) {
    const list = map.get(issue.status);
    if (list) list.push(issue);
  }
  return map;
}
