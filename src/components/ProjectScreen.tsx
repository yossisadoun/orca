import { MoreVertical, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from "react";
import { columns, issues } from "../data/mock";
import { PROJECT_DEMO_SCENARIO_MENU, resetToProjectDemoScenario } from "../data/projectDemoScenarios";
import {
  defaultFeaturesetGroups,
  defaultFeaturesetItemDefinitions,
  plannedFeaturesetItemDefinitions,
  featuresetIcons,
  featuresetIconPickerOptions,
  getFeaturesetByGroup,
  resolveFeaturesetItem,
  type FeaturesetGroup,
  type FeaturesetIconKey,
  type FeaturesetItem,
  type FeaturesetItemDefinition,
} from "../data/featureset";
import type { Issue, IssueStatus, AgentRoleId } from "../types";
import { getIssueStatusUpdateTooltip } from "../utils/issueStatusUpdateTooltip";
import {
  formatIssueUpdatedLabel,
  issueEnteringTodoWithBots,
  issueToSpecChatFeaturesetItem,
  nextIssueId,
} from "../utils/issueUtils";
import {
  getProjectScreenInitialState,
  persistProjectScreenState,
  pruneExpiredSnoozes,
} from "../utils/projectScreenPersistence";
import {
  findHumanReviewIssueForBranch,
  humanReviewBranchValue,
  viewerBranchOptionsFromIssues,
} from "../utils/viewerBranchOptions";
import {
  agentProgressPerTickForDuration,
  FIXED_DEMO_BOARD_AUTOMATION,
  IN_PROGRESS_AGENT_TICK_MS,
  loadDemoTuning,
  type DemoTuning,
} from "../utils/demoTuning";
import { buildAttentionThreads } from "../utils/attentionThreads";
import { suggestNextFeatures, type AISuggestedFeature } from "../utils/suggestFeatures";
import {
  type NewTodoPlanRow,
} from "../data/newTodoProjectPlan";
import { AppViewerPanel } from "./AppViewerPanel";
import { AttentionInboxPanel } from "./AttentionInboxPanel";
import { InboxAgentChatPanel } from "./InboxAgentChatPanel";
import { groupIssuesByStatus, KanbanColumnView } from "./KanbanColumn";
import { DemoTuningModal } from "./DemoTuningModal";
import { ExtendSpecChatModal } from "./ExtendSpecChatModal";
import { IssueDetailModal } from "./IssueDetailModal";
import { NewProjectFeatureChatModal } from "./NewProjectFeatureChatModal";
import styles from "./ProjectScreen.module.css";
import { StuckAgentChatPanel } from "./StuckAgentChatPanel";

type FeatureAction = "describe" | "extend";
type ViewTab = "control-center" | "inbox" | "viewer";

type SpecChatState =
  | { mode: "extend"; item: FeaturesetItem }
  | { mode: "specify"; issue: Issue; item: FeaturesetItem };
type FeatureTileColor = "white" | "red" | "yellow" | "green";

const FEATURE_TILE_CLASS: Record<FeatureTileColor, string> = {
  white: styles.featuresetTileWhite,
  red: styles.featuresetTileRed,
  yellow: styles.featuresetTileYellow,
  green: styles.featuresetTileGreen,
};

const FEATURE_TILE_COLOR_LABELS: Record<FeatureTileColor, string> = {
  white: "White",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
};

const FEATURE_TILE_MENU_ORDER: FeatureTileColor[] = ["white", "red", "yellow", "green"];

const NEW_GROUP_VALUE = "__new_group__";

const initialProjectScreen = getProjectScreenInitialState(issues);

function nextFeatureId() {
  return `feat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** First line / second line for Features column headings (after first space). */
function formatFeaturesetGroupLabel(title: string) {
  const i = title.indexOf(" ");
  if (i <= 0) {
    return title;
  }
  return (
    <>
      {title.slice(0, i)}
      <br />
      {title.slice(i + 1)}
    </>
  );
}

function AddFeaturePopover({
  open,
  groups,
  boardIssues,
  existingFeatureLabels,
  onClose,
  onCommit,
  onInstantAddSuggestion,
}: {
  open: boolean;
  groups: FeaturesetGroup[];
  boardIssues: Issue[];
  existingFeatureLabels: string[];
  onClose: () => void;
  onCommit: (data: {
    label: string;
    description: string;
    iconKey: FeaturesetIconKey;
    target: { kind: "existing"; groupId: string } | { kind: "new"; title: string; hint: string };
  }) => void;
  onInstantAddSuggestion: (s: AISuggestedFeature) => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [iconKey, setIconKey] = useState<FeaturesetIconKey>("sparkles");
  const [groupValue, setGroupValue] = useState<string>(groups[0]?.id ?? NEW_GROUP_VALUE);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupHint, setNewGroupHint] = useState("");

  const existingLabelsLower = useMemo(
    () => new Set(existingFeatureLabels.map((l) => l.trim().toLowerCase()).filter(Boolean)),
    [existingFeatureLabels],
  );

  const aiSuggestions = useMemo(
    () => suggestNextFeatures(boardIssues, existingLabelsLower),
    [boardIssues, existingLabelsLower],
  );

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setDescription("");
    setIconKey("sparkles");
    setGroupValue(groups[0]?.id ?? NEW_GROUP_VALUE);
    setNewGroupTitle("");
    setNewGroupHint("");
  }, [open, groups]);

  useEffect(() => {
    if (!open || groups.length === 0) return;
    if (groupValue !== NEW_GROUP_VALUE && !groups.some((g) => g.id === groupValue)) {
      setGroupValue(groups[0].id);
    }
  }, [open, groups, groupValue]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const labelTrim = label.trim();
    const descTrim = description.trim();
    if (!labelTrim || !descTrim) return;

    if (groupValue === NEW_GROUP_VALUE) {
      const titleTrim = newGroupTitle.trim();
      if (!titleTrim) return;
      onCommit({
        label: labelTrim,
        description: descTrim,
        iconKey,
        target: { kind: "new", title: titleTrim, hint: newGroupHint.trim() },
      });
      return;
    }

    onCommit({
      label: labelTrim,
      description: descTrim,
      iconKey,
      target: { kind: "existing", groupId: groupValue },
    });
  };

  return (
    <div className={styles.featuresetAddPopover} data-featureset-add>
      <p className={styles.featuresetAddPopoverTitle}>Add feature</p>
      <div className={styles.featuresetAddSuggested} aria-label="Suggested features">
        <div className={styles.featuresetAddSuggestedHeader}>
          <Sparkles size={13} strokeWidth={2} className={styles.featuresetAddSuggestedSparkle} aria-hidden />
          <span>Suggested features</span>
        </div>
        <ul className={styles.featuresetAddSuggestedList}>
          {aiSuggestions.map((s) => {
            const Icon = featuresetIcons[s.iconKey];
            return (
              <li key={s.label}>
                <button
                  type="button"
                  className={styles.featuresetAddSuggestedItem}
                  onClick={() => onInstantAddSuggestion(s)}
                >
                  <span className={styles.featuresetAddSuggestedItemIcon} aria-hidden>
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <span className={styles.featuresetAddSuggestedItemText}>
                    <span className={styles.featuresetAddSuggestedItemTitle}>{s.label}</span>
                    <span className={styles.featuresetAddSuggestedItemDesc}>{s.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <form onSubmit={submit}>
        <div className={styles.featuresetAddField}>
          <label htmlFor="featureset-add-label">Label</label>
          <input
            id="featureset-add-label"
            className={styles.featuresetAddInput}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Short name"
            autoComplete="off"
          />
        </div>
        <div className={styles.featuresetAddField}>
          <label htmlFor="featureset-add-desc">Description</label>
          <textarea
            id="featureset-add-desc"
            className={styles.featuresetAddTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this feature does (Describe tooltip)"
          />
        </div>
        <div className={styles.featuresetAddField}>
          <div className={styles.featuresetAddFieldLabel} id="featureset-add-icon-label">
            Icon
          </div>
          <div
            className={styles.featuresetAddIconGrid}
            role="group"
            aria-labelledby="featureset-add-icon-label"
          >
            {featuresetIconPickerOptions.map((opt) => {
              const Icon = featuresetIcons[opt.key];
              const selected = iconKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`${styles.featuresetAddIconCell} ${selected ? styles.featuresetAddIconCellSelected : ""}`}
                  onClick={() => setIconKey(opt.key)}
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={selected}
                >
                  <Icon size={10} strokeWidth={1.5} aria-hidden />
                </button>
              );
            })}
          </div>
          <p className={styles.featuresetAddIconCredit}>
            Icons from{" "}
            <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer">
              Lucide
            </a>
          </p>
        </div>
        <div className={styles.featuresetAddField}>
          <label htmlFor="featureset-add-group">Group</label>
          <select
            id="featureset-add-group"
            className={styles.featuresetAddSelect}
            value={groupValue}
            onChange={(e) => setGroupValue(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
            <option value={NEW_GROUP_VALUE}>New group…</option>
          </select>
        </div>
        {groupValue === NEW_GROUP_VALUE && (
          <>
            <div className={styles.featuresetAddField}>
              <label htmlFor="featureset-new-group-title">New group title</label>
              <input
                id="featureset-new-group-title"
                className={styles.featuresetAddInput}
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                placeholder="Section name"
                autoComplete="off"
              />
            </div>
            <div className={styles.featuresetAddField}>
              <label htmlFor="featureset-new-group-hint">Hint (optional)</label>
              <input
                id="featureset-new-group-hint"
                className={styles.featuresetAddInput}
                value={newGroupHint}
                onChange={(e) => setNewGroupHint(e.target.value)}
                placeholder="Tooltip / context"
                autoComplete="off"
              />
            </div>
          </>
        )}
        <div className={styles.featuresetAddActions}>
          <button type="button" className={styles.featuresetAddCancel} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.featuresetAddSubmit}>
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function FeaturesetTile({
  item,
  tileColor,
  menuOpen,
  describeOpen,
  onToggleMenu,
  onMenuAction,
  onSetTileColor,
  onDismissDescribe,
}: {
  item: FeaturesetItem;
  tileColor: FeatureTileColor;
  menuOpen: boolean;
  describeOpen: boolean;
  onToggleMenu: () => void;
  onMenuAction: (action: FeatureAction) => void;
  onSetTileColor: (color: FeatureTileColor) => void;
  onDismissDescribe: () => void;
}) {
  const { label, description, icon: Icon } = item;
  const raised = menuOpen || describeOpen;

  const tileVariantClass = FEATURE_TILE_CLASS[tileColor];

  return (
    <li
      className={`${styles.featuresetListItem} ${raised ? styles.featuresetListItemRaised : ""}`}
    >
      <button
        type="button"
        className={`${styles.featuresetTile} ${tileVariantClass} ${menuOpen ? styles.featuresetTileActive : ""} ${describeOpen ? styles.featuresetTileDescribe : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-featureset-tile
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu();
        }}
      >
        <Icon size={22} strokeWidth={1.5} className={styles.featuresetIcon} aria-hidden />
        <span className={styles.featuresetHoverLabel} aria-hidden>
          {label}
        </span>
      </button>
      {menuOpen && (
        <div
          className={styles.featuresetMenu}
          role="menu"
          aria-label={`Actions for ${label}`}
          data-featureset-menu
        >
          <button
            type="button"
            role="menuitem"
            className={styles.featuresetMenuItem}
            onClick={() => onMenuAction("describe")}
          >
            Describe
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.featuresetMenuItem}
            onClick={() => onMenuAction("extend")}
          >
            Extend
          </button>
          <div className={styles.featuresetMenuDivider} role="separator" />
          <div className={styles.featuresetMenuHeading}>Tile color</div>
          {FEATURE_TILE_MENU_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={tileColor === c}
              className={`${styles.featuresetMenuItem} ${tileColor === c ? styles.featuresetMenuItemChecked : ""}`}
              onClick={() => onSetTileColor(c)}
            >
              {FEATURE_TILE_COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      {describeOpen && (
        <div
          className={styles.featuresetDescribeTooltip}
          role="region"
          aria-label={`Description: ${label}`}
          data-featureset-describe
        >
          <p className={styles.featuresetDescribeHeading}>{label}</p>
          <p className={styles.featuresetDescribeText}>{description}</p>
          <button
            type="button"
            className={styles.featuresetDescribeDismiss}
            onClick={onDismissDescribe}
          >
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

function clampIssueMenuPosition(clientX: number, clientY: number, menuHeight = 260) {
  const menuWidth = 216;
  const pad = 8;
  let left = Math.min(clientX, window.innerWidth - menuWidth - pad);
  let top = Math.min(clientY, window.innerHeight - menuHeight - pad);
  return { left: Math.max(pad, left), top: Math.max(pad, top) };
}

/** Menu height estimate for pointer clamping (main menu vs snooze picker). */
const ISSUE_MENU_HEIGHT_MAIN = 364;
const ISSUE_MENU_HEIGHT_SNOOZE = 400;

function countInProgressIssues(issues: Issue[]): number {
  return issues.reduce((n, i) => n + (i.status === "in_progress" ? 1 : 0), 0);
}

type IssueCardMenuState = {
  issue: Issue;
  x: number;
  y: number;
  snoozeOpen?: boolean;
};

type StuckAgentPanelState = {
  issueId: string;
  roleId: AgentRoleId;
  x: number;
  y: number;
};

const SNOOZE_OPTIONS: { label: string; getUntil: () => number }[] = [
  { label: "1 hour", getUntil: () => Date.now() + 60 * 60 * 1000 },
  { label: "4 hours", getUntil: () => Date.now() + 4 * 60 * 60 * 1000 },
  {
    label: "Tomorrow",
    getUntil: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
  { label: "1 week", getUntil: () => Date.now() + 7 * 24 * 60 * 60 * 1000 },
];

function clampStuckAgentPanelPosition(clientX: number, clientY: number) {
  const panelW = 320;
  const panelH = 400;
  const pad = 8;
  let left = clientX;
  let top = clientY + 4;
  if (left + panelW > window.innerWidth - pad) {
    left = window.innerWidth - panelW - pad;
  }
  if (top + panelH > window.innerHeight - pad) {
    top = window.innerHeight - panelH - pad;
  }
  return {
    left: Math.max(pad, left),
    top: Math.max(pad, top),
  };
}

/** Human review with any stuck agent → back to in progress (stuck work stays off HR), WIP cap permitting. */
function mapDemoteHumanReviewWhenAnyAgentStuck(
  issues: Issue[],
  wipCap: number,
): { next: Issue[]; changed: boolean } {
  let inProgress = countInProgressIssues(issues);
  let changed = false;
  const next = issues.map((issue) => {
    if (issue.status !== "human_review" || !issue.agents?.length) return issue;
    const aw = issue.agentWork;
    if (!aw) return issue;
    const anyStuck = issue.agents.some((role) => aw[role]?.stuck);
    if (!anyStuck) return issue;
    if (inProgress >= wipCap) return issue;
    changed = true;
    inProgress += 1;
    return {
      ...issue,
      status: "in_progress" as const,
      updatedLabel: formatIssueUpdatedLabel(),
    };
  });
  return { next, changed };
}

/** In-progress issues where every agent is `complete` and none `stuck` → human review. */
function mapPromoteInProgressWhenAllAgentsDone(issues: Issue[]): { next: Issue[]; changed: boolean } {
  let changed = false;
  const next = issues.map((issue) => {
    if (issue.status !== "in_progress" || !issue.agents?.length) return issue;
    const aw = issue.agentWork;
    if (!aw) return issue;
    if (issue.agents.some((role) => aw[role]?.stuck)) return issue;
    const allDone = issue.agents.every((role) => {
      const w = aw[role];
      return Boolean(w?.complete && !w?.stuck);
    });
    if (!allDone) return issue;
    changed = true;
    return {
      ...issue,
      status: "human_review" as const,
      humanAsk:
        issue.humanAsk?.trim() ||
        "All agents finished this work — review the outcome to merge or request changes.",
      updatedLabel: formatIssueUpdatedLabel(),
    };
  });
  return { next, changed };
}

/** Todo with scheduled bot pickup → in progress when WIP slot available (FCFS by pickup time). */
function mapPromoteTodoWhenBotsPickupDue(
  issues: Issue[],
  now: number,
  wipCap: number,
  blockedVariantOnPickupPercent: number,
): { next: Issue[]; changed: boolean } {
  let inProgress = countInProgressIssues(issues);

  const eligibleIdx: number[] = [];
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]!;
    if (issue.status !== "todo") continue;
    if (issue.todoBotPickupAt == null || now < issue.todoBotPickupAt) continue;
    if (!issue.agents?.length || !issue.agentWork) continue;
    eligibleIdx.push(i);
  }
  eligibleIdx.sort((a, b) => {
    const ta = issues[a]!.todoBotPickupAt ?? 0;
    const tb = issues[b]!.todoBotPickupAt ?? 0;
    if (ta !== tb) return ta - tb;
    return issues[a]!.id.localeCompare(issues[b]!.id);
  });

  let changed = false;
  const next = [...issues];
  for (const i of eligibleIdx) {
    if (inProgress >= wipCap) break;
    const issue = next[i]!;
    if (issue.status !== "todo") continue;
    const { todoBotPickupAt: _t, ...rest } = issue;
    const rollBlocked =
      blockedVariantOnPickupPercent > 0 &&
      issue.variant !== "highlight" &&
      issue.variant !== "blocked" &&
      Math.random() * 100 < blockedVariantOnPickupPercent;
    const variant = rollBlocked ? ("blocked" as const) : issue.variant;
    next[i] = {
      ...rest,
      status: "in_progress" as const,
      updatedLabel: formatIssueUpdatedLabel(),
      ...(variant !== issue.variant ? { variant } : {}),
    };
    inProgress += 1;
    changed = true;
  }
  return { next: changed ? next : issues, changed };
}

/**
 * Merge always lands a catalog tile; `getFeaturesetByGroup` only shows items whose groupId exists in
 * `customGroups`. When the new-project shell has hide-default + empty custom groups, ensure a row exists.
 */
function resolveMergeFeatureGroup(
  customGroups: FeaturesetGroup[],
  hideDefaultCatalog: boolean,
): { groupId: string; groupsToAdd: FeaturesetGroup[] } {
  if (customGroups.some((g) => g.id === "task-surface")) {
    return { groupId: "task-surface", groupsToAdd: [] };
  }
  if (customGroups.length > 0) {
    return { groupId: customGroups[0]!.id, groupsToAdd: [] };
  }
  if (hideDefaultCatalog) {
    const template = defaultFeaturesetGroups.find((g) => g.id === "task-surface");
    return {
      groupId: "task-surface",
      groupsToAdd: [
        template
          ? { ...template }
          : { id: "task-surface", title: "Task list", hint: "Features landed from merge." },
      ],
    };
  }
  return { groupId: "task-surface", groupsToAdd: [] };
}

function clampStatusTooltipPosition(clientX: number, clientY: number) {
  const tipWidth = 300;
  const tipHeight = 220;
  const pad = 8;
  let left = Math.min(clientX, window.innerWidth - tipWidth - pad);
  let top = Math.min(clientY, window.innerHeight - tipHeight - pad);
  return { left: Math.max(pad, left), top: Math.max(pad, top) };
}

export function ProjectScreen() {
  const visibleColumnIds: IssueStatus[] = columns.map((c) => c.id);
  const [boardIssues, setBoardIssues] = useState<Issue[]>(initialProjectScreen.boardIssues);
  const [snoozedUntilById, setSnoozedUntilById] = useState<Record<string, number>>(
    initialProjectScreen.snoozedUntilById,
  );
  const [snoozeWallClock, setSnoozeWallClock] = useState(0);
  const [viewTab, setViewTab] = useState<ViewTab>(initialProjectScreen.viewTab);
  const [featureMenuId, setFeatureMenuId] = useState<string | null>(null);
  const [describeTooltipId, setDescribeTooltipId] = useState<string | null>(null);
  const [specChat, setSpecChat] = useState<SpecChatState | null>(null);
  const [customGroups, setCustomGroups] = useState<FeaturesetGroup[]>(
    initialProjectScreen.customGroups,
  );
  const [customItemDefs, setCustomItemDefs] = useState<FeaturesetItemDefinition[]>(
    initialProjectScreen.customItemDefs,
  );
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  const [chromeOptionsMenuOpen, setChromeOptionsMenuOpen] = useState(false);
  const [featureTileColors, setFeatureTileColors] = useState<
    Partial<Record<string, FeatureTileColor>>
  >(initialProjectScreen.featureTileColors);
  const featuresetPaneRef = useRef<ElementRef<"div">>(null);
  const [mergeProgressById, setMergeProgressById] = useState<Record<string, number>>({});
  const mergeIssueSnapshotRef = useRef<Record<string, Issue>>({});
  const [hideDefaultFeaturesetCatalog, setHideDefaultFeaturesetCatalog] = useState(
    initialProjectScreen.hideDefaultFeaturesetCatalog,
  );
  const [demoTuning, setDemoTuning] = useState<DemoTuning>(() => loadDemoTuning());
  const [demoTuningOpen, setDemoTuningOpen] = useState(false);
  const [newProjectChatOpen, setNewProjectChatOpen] = useState(false);
  const [viewerBranch, setViewerBranch] = useState(initialProjectScreen.viewerBranch);
  const [viewerBranchLoadNonce, setViewerBranchLoadNonce] = useState(0);
  const onViewerBranchChange = useCallback((v: string) => setViewerBranch(v), []);

  const [issueCardMenu, setIssueCardMenu] = useState<IssueCardMenuState | null>(null);
  const [stuckAgentPanel, setStuckAgentPanel] = useState<StuckAgentPanelState | null>(null);
  const [statusUpdateTooltip, setStatusUpdateTooltip] = useState<{
    issue: Issue;
    x: number;
    y: number;
  } | null>(null);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [inboxSelectedThreadKey, setInboxSelectedThreadKey] = useState<string | null>(null);
  const detailIndex = detailIssue
    ? Math.max(0, boardIssues.findIndex((i) => i.id === detailIssue.id))
    : 0;

  const allGroups = useMemo(
    () =>
      hideDefaultFeaturesetCatalog
        ? [...customGroups]
        : [...defaultFeaturesetGroups, ...customGroups],
    [customGroups, hideDefaultFeaturesetCatalog],
  );

  const catalogTileItems = useMemo(
    () =>
      (hideDefaultFeaturesetCatalog
        ? [...customItemDefs]
        : [...defaultFeaturesetItemDefinitions, ...customItemDefs]
      ).map(resolveFeaturesetItem),
    [customItemDefs, hideDefaultFeaturesetCatalog],
  );

  const allItems = useMemo(
    () =>
      hideDefaultFeaturesetCatalog
        ? [...catalogTileItems]
        : [...catalogTileItems, ...plannedFeaturesetItemDefinitions.map(resolveFeaturesetItem)],
    [catalogTileItems, hideDefaultFeaturesetCatalog],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setSnoozeWallClock((c) => c + 1);
      setSnoozedUntilById((prev) => pruneExpiredSnoozes(prev));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    persistProjectScreenState({
      boardIssues,
      snoozedUntilById,
      viewTab,
      customGroups,
      customItemDefs,
      featureTileColors,
      viewerBranch,
      hideDefaultFeaturesetCatalog,
    });
  }, [
    boardIssues,
    snoozedUntilById,
    viewTab,
    customGroups,
    customItemDefs,
    featureTileColors,
    viewerBranch,
    hideDefaultFeaturesetCatalog,
  ]);

  useEffect(() => {
    if (!stuckAgentPanel) return;
    const i = boardIssues.find((x) => x.id === stuckAgentPanel.issueId);
    if (!i?.agentWork?.[stuckAgentPanel.roleId]?.stuck) {
      setStuckAgentPanel(null);
    }
  }, [boardIssues, stuckAgentPanel]);

  useEffect(() => {
    setBoardIssues((prev) => {
      let changed = false;
      const { next: afterDemote, changed: demoted } = mapDemoteHumanReviewWhenAnyAgentStuck(
        prev,
        FIXED_DEMO_BOARD_AUTOMATION.maxInProgress,
      );
      if (demoted) changed = true;
      const { next: afterPromote, changed: promoted } =
        mapPromoteInProgressWhenAllAgentsDone(afterDemote);
      if (promoted) changed = true;
      const { next: afterTodoPickup, changed: todoPickup } = mapPromoteTodoWhenBotsPickupDue(
        afterPromote,
        Date.now(),
        FIXED_DEMO_BOARD_AUTOMATION.maxInProgress,
        FIXED_DEMO_BOARD_AUTOMATION.blockedVariantOnPickupPercent,
      );
      if (todoPickup) changed = true;
      return changed ? afterTodoPickup : prev;
    });
  }, [boardIssues]);

  useEffect(() => {
    const { maxInProgress, blockedVariantOnPickupPercent } = FIXED_DEMO_BOARD_AUTOMATION;
    const agentProgressPerTick = agentProgressPerTickForDuration(
      demoTuning.inProgressSecondsPerBot,
    );
    const stuckProb = demoTuning.inProgressBotFailProbability;
    const id = window.setInterval(() => {
      setBoardIssues((prev) => {
        let changed = false;
        const { next: afterDemote, changed: demoted } = mapDemoteHumanReviewWhenAnyAgentStuck(
          prev,
          maxInProgress,
        );
        if (demoted) changed = true;
        const base = afterDemote;

        const afterTick = base.map((issue) => {
          if (issue.status !== "in_progress" || !issue.agents?.length) return issue;
          const aw = issue.agentWork;
          if (!aw) return issue;
          let issueChanged = false;
          const nextAw = { ...aw };
          for (const role of issue.agents) {
            const w = nextAw[role];
            if (!w || w.complete || w.stuck) continue;
            if (
              stuckProb > 0 &&
              w.progress >= 12 &&
              w.progress < 100 &&
              Math.random() < stuckProb
            ) {
              nextAw[role] = { ...w, stuck: true };
              issueChanged = true;
              continue;
            }
            const p = Math.min(100, w.progress + agentProgressPerTick);
            const complete = p >= 100;
            if (p === w.progress && w.complete === complete) continue;
            nextAw[role] = {
              ...w,
              progress: complete ? 100 : p,
              ...(complete ? { complete: true } : {}),
            };
            issueChanged = true;
          }
          if (!issueChanged) return issue;
          changed = true;
          return { ...issue, agentWork: nextAw };
        });

        const { next: afterPromote, changed: promoted } =
          mapPromoteInProgressWhenAllAgentsDone(afterTick);
        if (promoted) changed = true;
        const { next: afterTodoPickup, changed: todoPickup } = mapPromoteTodoWhenBotsPickupDue(
          afterPromote,
          Date.now(),
          maxInProgress,
          blockedVariantOnPickupPercent,
        );
        if (todoPickup) changed = true;

        return changed ? afterTodoPickup : prev;
      });
    }, IN_PROGRESS_AGENT_TICK_MS);
    return () => clearInterval(id);
  }, [
    demoTuning.inProgressSecondsPerBot,
    demoTuning.inProgressBotFailProbability,
  ]);

  useEffect(() => {
    setDetailIssue((cur) => {
      if (!cur) return cur;
      const latest = boardIssues.find((i) => i.id === cur.id);
      if (!latest) return null;
      return latest;
    });
  }, [boardIssues]);

  useEffect(() => {
    const active = Object.values(mergeProgressById).some((p) => p < 100);
    if (!active) return;
    const step = FIXED_DEMO_BOARD_AUTOMATION.mergeProgressPerTick;
    const ms = FIXED_DEMO_BOARD_AUTOMATION.mergeTickIntervalMs;
    const t = window.setInterval(() => {
      setMergeProgressById((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of Object.keys(next)) {
          if (next[id] >= 100) continue;
          next[id] = Math.min(100, next[id] + step);
          changed = true;
        }
        return changed ? next : prev;
      });
    }, ms);
    return () => clearInterval(t);
  }, [mergeProgressById]);

  useEffect(() => {
    const done = Object.entries(mergeProgressById)
      .filter(([, p]) => p >= 100)
      .map(([id]) => id);
    if (done.length === 0) return;

    const { groupId: mergeGroupId, groupsToAdd } = resolveMergeFeatureGroup(
      customGroups,
      hideDefaultFeaturesetCatalog,
    );

    const newDefs: FeaturesetItemDefinition[] = [];
    const removeIds = new Set<string>();

    for (const id of done) {
      const snap = mergeIssueSnapshotRef.current[id];
      delete mergeIssueSnapshotRef.current[id];
      if (!snap) continue;
      removeIds.add(id);
      const body = [
        snap.description?.trim(),
        snap.humanAsk?.trim() ? `Human review: ${snap.humanAsk.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      const description =
        body || `Merged from board issue ${snap.id}. Landed in Features.`;
      newDefs.push({
        id: nextFeatureId(),
        groupId: mergeGroupId,
        label: snap.title,
        description,
        iconKey: "link2",
      });
    }

    if (groupsToAdd.length > 0) {
      setCustomGroups((prev) => {
        if (prev.some((g) => g.id === mergeGroupId)) return prev;
        return [...prev, ...groupsToAdd];
      });
    }
    if (newDefs.length > 0) {
      setCustomItemDefs((prev) => [...prev, ...newDefs]);
    }
    if (removeIds.size > 0) {
      setBoardIssues((prev) => prev.filter((i) => !removeIds.has(i.id)));
      setSnoozedUntilById((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of removeIds) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setDetailIssue((cur) => (cur && removeIds.has(cur.id) ? null : cur));
    }

    setMergeProgressById((prev) => {
      const next = { ...prev };
      for (const id of done) delete next[id];
      return next;
    });
  }, [mergeProgressById, customGroups, hideDefaultFeaturesetCatalog]);

  const visibleBoardIssues = useMemo(() => {
    void snoozeWallClock;
    const now = Date.now();
    return boardIssues.filter((i) => {
      const until = snoozedUntilById[i.id];
      return until == null || now >= until;
    });
  }, [boardIssues, snoozedUntilById, snoozeWallClock]);

  const grouped = groupIssuesByStatus(visibleBoardIssues, visibleColumnIds);

  const inboxThreads = useMemo(
    () => buildAttentionThreads(visibleBoardIssues),
    [visibleBoardIssues],
  );

  const attentionThreadCount = inboxThreads.length;

  const inboxSelectedThread = useMemo(
    () => inboxThreads.find((t) => t.threadKey === inboxSelectedThreadKey) ?? null,
    [inboxThreads, inboxSelectedThreadKey],
  );

  useEffect(() => {
    if (viewTab !== "inbox") setInboxSelectedThreadKey(null);
  }, [viewTab]);

  useEffect(() => {
    if (!inboxSelectedThreadKey) return;
    if (!inboxThreads.some((t) => t.threadKey === inboxSelectedThreadKey)) {
      setInboxSelectedThreadKey(null);
    }
  }, [inboxThreads, inboxSelectedThreadKey]);

  const [draggingBacklogIssueId, setDraggingBacklogIssueId] = useState<string | null>(null);

  const backlogTodoDrag = useMemo(
    () => ({
      draggingIssueId: draggingBacklogIssueId,
      onBacklogDragStart: (id: string) => setDraggingBacklogIssueId(id),
      onBacklogDragEnd: () => setDraggingBacklogIssueId(null),
      onDropBacklogOnTodo: (issueId: string) => {
        setBoardIssues((prev) => {
          const cur = prev.find((i) => i.id === issueId);
          if (!cur || cur.status !== "backlog") return prev;
          return prev.map((i) =>
            i.id === issueId
              ? issueEnteringTodoWithBots(
                  cur,
                  Date.now(),
                  FIXED_DEMO_BOARD_AUTOMATION.todoPickupDelayMs,
                )
              : i,
          );
        });
      },
    }),
    [draggingBacklogIssueId],
  );

  useEffect(() => {
    if (!featureMenuId && !describeTooltipId && !addFeatureOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const pane = featuresetPaneRef.current;
      const target = e.target as Node;
      if (!pane?.contains(target)) {
        setFeatureMenuId(null);
        setDescribeTooltipId(null);
        setAddFeatureOpen(false);
        return;
      }
      const el = e.target as Element;
      if (addFeatureOpen && !el.closest("[data-featureset-add]")) {
        setAddFeatureOpen(false);
      }
      if (
        featureMenuId &&
        !el.closest("[data-featureset-menu]") &&
        !el.closest("[data-featureset-tile]")
      ) {
        setFeatureMenuId(null);
      }
      if (
        describeTooltipId &&
        !el.closest("[data-featureset-describe]") &&
        !el.closest("[data-featureset-tile]")
      ) {
        setDescribeTooltipId(null);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFeatureMenuId(null);
      setDescribeTooltipId(null);
      setAddFeatureOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [featureMenuId, describeTooltipId, addFeatureOpen]);

  useEffect(() => {
    const opts = viewerBranchOptionsFromIssues(boardIssues);
    const valid = [...opts.release, ...opts.humanReview].some((o) => o.value === viewerBranch);
    if (!valid) setViewerBranch("main");
  }, [boardIssues, viewerBranch]);

  useEffect(() => {
    if (!issueCardMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element;
      if (!el.closest("[data-issue-card-menu]")) {
        setIssueCardMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIssueCardMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [issueCardMenu]);

  useEffect(() => {
    if (!chromeOptionsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element;
      if (!el.closest("[data-chrome-options]")) {
        setChromeOptionsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setChromeOptionsMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [chromeOptionsMenuOpen]);

  useEffect(() => {
    if (!statusUpdateTooltip) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element;
      if (el.closest("[data-status-update-tooltip]")) return;
      setStatusUpdateTooltip(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatusUpdateTooltip(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [statusUpdateTooltip]);

  const runFeatureAction = (action: FeatureAction, item: FeaturesetItem) => {
    setFeatureMenuId(null);
    if (action === "describe") {
      setDescribeTooltipId(item.id);
      setSpecChat(null);
      return;
    }
    setDescribeTooltipId(null);
    setSpecChat({ mode: "extend", item });
  };

  const setFeatureTileColorForId = (itemId: string, color: FeatureTileColor) => {
    setFeatureTileColors((prev) => {
      const next = { ...prev };
      if (color === "white") {
        delete next[itemId];
      } else {
        next[itemId] = color;
      }
      return next;
    });
  };

  const handleAddFeatureCommit = (data: {
    label: string;
    description: string;
    iconKey: FeaturesetIconKey;
    target: { kind: "existing"; groupId: string } | { kind: "new"; title: string; hint: string };
  }) => {
    let groupId: string;
    if (data.target.kind === "new") {
      const g: FeaturesetGroup = {
        id: nextGroupId(),
        title: data.target.title,
        hint: data.target.hint || undefined,
      };
      setCustomGroups((prev) => [...prev, g]);
      groupId = g.id;
    } else {
      groupId = data.target.groupId;
    }
    const def: FeaturesetItemDefinition = {
      id: nextFeatureId(),
      groupId,
      label: data.label,
      description: data.description,
      iconKey: data.iconKey,
    };
    setCustomItemDefs((prev) => [...prev, def]);
    setAddFeatureOpen(false);
  };

  const handleSuggestedFeatureInstantAdd = (s: AISuggestedFeature) => {
    const groupId = allGroups.some((g) => g.id === s.groupId)
      ? s.groupId
      : (allGroups[0]?.id ?? "lists");
    handleAddFeatureCommit({
      label: s.label,
      description: s.description,
      iconKey: s.iconKey,
      target: { kind: "existing", groupId },
    });
    setBoardIssues((prev) => [
      ...prev,
      {
        id: nextIssueId(prev),
        title: s.label,
        status: "backlog",
        updatedLabel: formatIssueUpdatedLabel(),
        description: s.description,
      },
    ]);
  };

  const applyNewProjectFromPlan = useCallback((plan: NewTodoPlanRow[]) => {
    const backlog: Issue[] = [];
    for (const row of plan) {
      backlog.push({
        id: nextIssueId(backlog),
        title: row.label,
        status: "backlog",
        updatedLabel: formatIssueUpdatedLabel(),
        description: row.description,
      });
    }
    mergeIssueSnapshotRef.current = {};
    setHideDefaultFeaturesetCatalog(true);
    setCustomGroups([]);
    setCustomItemDefs([]);
    setFeatureTileColors({});
    setBoardIssues(backlog);
    setSnoozedUntilById({});
    setMergeProgressById({});
    setFeatureMenuId(null);
    setDescribeTooltipId(null);
    setAddFeatureOpen(false);
    setSpecChat(null);
    setDetailIssue(null);
    setIssueCardMenu(null);
    setStuckAgentPanel(null);
    setStatusUpdateTooltip(null);
    setViewTab("control-center");
    setViewerBranch("main");
    setViewerBranchLoadNonce((n) => n + 1);
    setNewProjectChatOpen(false);
    setChromeOptionsMenuOpen(false);
  }, []);

  const issueMenuPosition = issueCardMenu
    ? clampIssueMenuPosition(
        issueCardMenu.x,
        issueCardMenu.y,
        issueCardMenu.snoozeOpen ? ISSUE_MENU_HEIGHT_SNOOZE : ISSUE_MENU_HEIGHT_MAIN,
      )
    : null;

  const closeIssueCardMenu = () => setIssueCardMenu(null);

  const applySnooze = (issueId: string, until: number) => {
    setSnoozedUntilById((prev) => ({ ...prev, [issueId]: until }));
    setDetailIssue((cur) => (cur?.id === issueId ? null : cur));
    closeIssueCardMenu();
  };

  const handleIssueMenuRequest = (issue: Issue, clientX: number, clientY: number) => {
    setStuckAgentPanel(null);
    setIssueCardMenu({ issue, x: clientX, y: clientY, snoozeOpen: false });
  };

  const handleStuckAgentClick = useCallback(
    (issue: Issue, roleId: AgentRoleId, clientX: number, clientY: number) => {
      if (!issue.agentWork?.[roleId]?.stuck) return;
      setIssueCardMenu(null);
      setStatusUpdateTooltip(null);
      setStuckAgentPanel({ issueId: issue.id, roleId, x: clientX, y: clientY });
    },
    [],
  );

  const applyUnblockAgent = useCallback((issueId: string, roleId: AgentRoleId) => {
    setBoardIssues((prev) =>
      prev.map((i) => {
        if (i.id !== issueId) return i;
        const aw = i.agentWork?.[roleId];
        if (!aw?.stuck) return i;
        const fromHumanReview = i.status === "human_review";
        return {
          ...i,
          status: "in_progress" as const,
          agentWork: {
            ...i.agentWork,
            [roleId]: { ...aw, stuck: false, progress: 88, complete: false },
          },
          ...(fromHumanReview
            ? { humanAsk: undefined, updatedLabel: formatIssueUpdatedLabel() }
            : {}),
        };
      }),
    );
    setDetailIssue((cur) => {
      if (!cur || cur.id !== issueId) return cur;
      const aw = cur.agentWork?.[roleId];
      if (!aw?.stuck) return cur;
      return {
        ...cur,
        status: "in_progress",
        humanAsk: undefined,
        agentWork: {
          ...cur.agentWork,
          [roleId]: { ...aw, stuck: false, progress: 88, complete: false },
        },
      };
    });
    setStuckAgentPanel(null);
  }, []);

  const mergeHumanReviewBranchFromViewer = useCallback(() => {
    let mergedId: string | null = null;
    setBoardIssues((prev) => {
      const issue = findHumanReviewIssueForBranch(prev, viewerBranch);
      if (!issue) return prev;
      mergedId = issue.id;
      mergeIssueSnapshotRef.current[issue.id] = { ...issue, status: "merge" };
      return prev.map((i) => (i.id === issue.id ? { ...i, status: "merge" as const } : i));
    });
    if (mergedId) {
      setViewTab("control-center");
      setMergeProgressById((prev) => ({ ...prev, [mergedId!]: 0 }));
      setDetailIssue((cur) => (cur?.id === mergedId ? { ...cur, status: "merge" } : cur));
    }
  }, [viewerBranch]);

  const statusTooltipPosition = statusUpdateTooltip
    ? clampStatusTooltipPosition(statusUpdateTooltip.x, statusUpdateTooltip.y)
    : null;

  const statusTooltipCopy = useMemo(
    () =>
      statusUpdateTooltip ? getIssueStatusUpdateTooltip(statusUpdateTooltip.issue) : null,
    [statusUpdateTooltip],
  );

  const stuckAgentChatEl = useMemo(() => {
    if (!stuckAgentPanel) return null;
    const si = boardIssues.find((i) => i.id === stuckAgentPanel.issueId);
    if (!si?.agentWork?.[stuckAgentPanel.roleId]?.stuck) return null;
    const pos = clampStuckAgentPanelPosition(stuckAgentPanel.x, stuckAgentPanel.y);
    const rid = stuckAgentPanel.roleId;
    return (
      <StuckAgentChatPanel
        issueId={si.id}
        issueTitle={si.title}
        roleId={rid}
        anchorLeft={pos.left}
        anchorTop={pos.top}
        onClose={() => setStuckAgentPanel(null)}
        onUnblock={() => applyUnblockAgent(si.id, rid)}
      />
    );
  }, [stuckAgentPanel, boardIssues, applyUnblockAgent]);

  return (
    <div className={styles.shell}>
      <div className={styles.chromeTop}>
        <div className={styles.traffic}>
          <span className={styles.dotRed} />
          <span className={styles.dotYellow} />
          <span className={styles.dotGreen} />
        </div>
        <div className={styles.breadcrumb}>
          <span className={styles.crumb}>TODO App</span>
          <span className={styles.crumbSep} aria-hidden>
            ›
          </span>
          <span className={styles.crumbActive}>
            {viewTab === "control-center"
              ? "Control Center"
              : viewTab === "inbox"
                ? "Inbox"
                : "Viewer"}
          </span>
        </div>
        <div className={styles.chromeActions}>
          <div className={styles.chromeMenuAnchor} data-chrome-options>
            <button
              type="button"
              className={styles.chromeIconBtn}
              aria-label="More options"
              title="More options"
              aria-expanded={chromeOptionsMenuOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setChromeOptionsMenuOpen((v) => !v);
              }}
            >
              <MoreVertical size={16} strokeWidth={2} aria-hidden />
            </button>
            {chromeOptionsMenuOpen ? (
              <div
                className={styles.chromeOptionsMenu}
                role="menu"
                aria-label="Demo options"
                data-chrome-options-menu
              >
                {PROJECT_DEMO_SCENARIO_MENU.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    role="menuitem"
                    className={styles.featuresetMenuItem}
                    onClick={() => {
                      setChromeOptionsMenuOpen(false);
                      if (scenario.id === "new_project") {
                        setNewProjectChatOpen(true);
                        return;
                      }
                      if (
                        scenario.confirmMessage === undefined ||
                        !window.confirm(scenario.confirmMessage)
                      ) {
                        return;
                      }
                      resetToProjectDemoScenario(scenario.id);
                    }}
                  >
                    {scenario.label}
                  </button>
                ))}
                <div className={styles.chromeOptionsDivider} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.featuresetMenuItem}
                  onClick={() => {
                    setChromeOptionsMenuOpen(false);
                    setDemoTuningOpen(true);
                  }}
                >
                  Tune automation…
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.workspaceInner}>
      <header className={styles.projectBar}>
        <div className={styles.projectTitleRow}>
          <div className={styles.projectIdentity}>
            <span className={styles.projectName}>TODO App</span>
          </div>
        </div>
        <div
          ref={featuresetPaneRef}
          className={styles.featuresetBlock}
        >
          <h2 className={styles.featuresetTitleAbove} id="features-heading">
            Features
          </h2>
          <section
            className={styles.featuresetPane}
            aria-labelledby="features-heading"
          >
            <div className={styles.featuresetBodyRow}>
              <div className={styles.featuresetRowstretch}>
                <div className={styles.featuresetRow}>
                  {getFeaturesetByGroup(allGroups, catalogTileItems).map(({ group, items }) => (
                    <div
                      key={group.id}
                      className={styles.featuresetRowGroup}
                      role="group"
                      aria-label={group.hint ? `${group.title}. ${group.hint}` : group.title}
                    >
                      <span
                        className={styles.featuresetRowGroupLabel}
                        title={group.hint}
                      >
                        {formatFeaturesetGroupLabel(group.title)}
                      </span>
                      <ul className={styles.featuresetGrid}>
                        {items.map((item) => (
                          <FeaturesetTile
                            key={item.id}
                            item={item}
                            tileColor={featureTileColors[item.id] ?? "white"}
                            menuOpen={featureMenuId === item.id}
                            describeOpen={describeTooltipId === item.id}
                            onToggleMenu={() => {
                              setAddFeatureOpen(false);
                              setFeatureMenuId((open) => (open === item.id ? null : item.id));
                            }}
                            onMenuAction={(action) => runFeatureAction(action, item)}
                            onSetTileColor={(c) => setFeatureTileColorForId(item.id, c)}
                            onDismissDescribe={() => setDescribeTooltipId(null)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className={styles.featuresetAddWrap} data-featureset-add>
                  <button
                    type="button"
                    className={`${styles.featuresetAddBtn} ${addFeatureOpen ? styles.featuresetAddBtnActive : ""}`}
                    aria-expanded={addFeatureOpen}
                    aria-haspopup="dialog"
                    aria-label="Add feature"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeatureMenuId(null);
                      setDescribeTooltipId(null);
                      setAddFeatureOpen((v) => !v);
                    }}
                  >
                    <Plus size={22} strokeWidth={1.5} aria-hidden />
                  </button>
                  <AddFeaturePopover
                    open={addFeatureOpen}
                    groups={allGroups}
                    boardIssues={boardIssues}
                    existingFeatureLabels={allItems.map((i) => i.label)}
                    onClose={() => setAddFeatureOpen(false)}
                    onCommit={handleAddFeatureCommit}
                    onInstantAddSuggestion={handleSuggestedFeatureInstantAdd}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
        <div className={styles.tabsRow}>
          <nav className={styles.tabs} aria-label="Project">
            <button
              type="button"
              className={`${styles.tab} ${viewTab === "control-center" ? styles.tabActive : ""}`}
              onClick={() => setViewTab("control-center")}
              aria-current={viewTab === "control-center" ? "page" : undefined}
            >
              Control Center
            </button>
            <button
              type="button"
              className={`${styles.tab} ${viewTab === "inbox" ? styles.tabActive : ""}`}
              onClick={() => setViewTab("inbox")}
              aria-current={viewTab === "inbox" ? "page" : undefined}
              aria-label={
                attentionThreadCount > 0
                  ? `Inbox, ${attentionThreadCount} need attention`
                  : "Inbox, clear"
              }
            >
              Inbox
              {attentionThreadCount > 0 ? (
                <span aria-hidden> ({attentionThreadCount})</span>
              ) : null}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${viewTab === "viewer" ? styles.tabActive : ""}`}
              onClick={() => setViewTab("viewer")}
              aria-current={viewTab === "viewer" ? "page" : undefined}
            >
              Viewer
            </button>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        {viewTab === "control-center" ? (
        <div className={styles.board}>
          {columns.map((col) => (
            <KanbanColumnView
              key={col.id}
              column={col}
              items={grouped.get(col.id) ?? []}
              mergeProgressById={mergeProgressById}
              onIssueMenuRequest={handleIssueMenuRequest}
              onStuckAgentClick={handleStuckAgentClick}
              backlogTodoDrag={backlogTodoDrag}
            />
          ))}
        </div>
        ) : viewTab === "inbox" ? (
        <div className={styles.inboxMain}>
          <div className={styles.inboxCenteredWrap}>
            <div className={styles.inboxListColumn}>
              <AttentionInboxPanel
                issues={visibleBoardIssues}
                selectedThreadKey={inboxSelectedThreadKey}
                onSelectThread={(thread) => setInboxSelectedThreadKey(thread.threadKey)}
              />
            </div>
            <InboxAgentChatPanel
              thread={inboxSelectedThread}
              mergeProgress={
                inboxSelectedThread?.reason === "merge"
                  ? mergeProgressById[inboxSelectedThread.issue.id]
                  : undefined
              }
              onUnblockAgent={applyUnblockAgent}
              onOpenIssueDetails={(issue) => setDetailIssue(issue)}
            />
          </div>
        </div>
        ) : (
        <AppViewerPanel
          featuresetItems={allItems}
          issues={boardIssues}
          branch={viewerBranch}
          onBranchChange={onViewerBranchChange}
          branchLoadNonce={viewerBranchLoadNonce}
          onMergeHumanReviewBranch={
            findHumanReviewIssueForBranch(boardIssues, viewerBranch)
              ? mergeHumanReviewBranchFromViewer
              : undefined
          }
        />
        )}
      </main>
        </div>
      </div>

      {specChat != null && (
        <ExtendSpecChatModal
          item={specChat.item}
          mode={specChat.mode}
          open
          onClose={() => setSpecChat(null)}
          onSpecResolved={() => {
            setSpecChat((cur) => {
              if (!cur) return null;
              if (cur.mode === "extend") {
                const featureItem = cur.item;
                setBoardIssues((prev) => {
                  const newIssue: Issue = {
                    id: nextIssueId(prev),
                    title: featureItem.label,
                    status: "backlog",
                    updatedLabel: formatIssueUpdatedLabel(),
                    featuresetTagIds: [featureItem.id],
                  };
                  return [...prev, newIssue];
                });
              } else {
                const issueId = cur.issue.id;
                setBoardIssues((prev) =>
                  prev.map((i) =>
                    i.id === issueId
                      ? issueEnteringTodoWithBots(
                          i,
                          Date.now(),
                          FIXED_DEMO_BOARD_AUTOMATION.todoPickupDelayMs,
                        )
                      : i,
                  ),
                );
              }
              return null;
            });
          }}
        />
      )}
      <NewProjectFeatureChatModal
        open={newProjectChatOpen}
        onClose={() => setNewProjectChatOpen(false)}
        onApprove={applyNewProjectFromPlan}
      />
      <DemoTuningModal
        open={demoTuningOpen}
        initial={demoTuning}
        onClose={() => setDemoTuningOpen(false)}
        onSave={(next) => setDemoTuning(next)}
      />
      <IssueDetailModal
        issue={detailIssue}
        open={detailIssue != null}
        index={detailIndex}
        total={boardIssues.length}
        onClose={() => setDetailIssue(null)}
      />
      {stuckAgentChatEl}
      {issueCardMenu && issueMenuPosition && (
        <div
          className={styles.issueCardMenu}
          role="menu"
          data-issue-card-menu
          style={{ left: issueMenuPosition.left, top: issueMenuPosition.top }}
          aria-label={
            issueCardMenu.snoozeOpen ? "Snooze duration" : "Issue actions"
          }
        >
          {issueCardMenu.snoozeOpen ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.issueCardMenuItem}
                onClick={() =>
                  setIssueCardMenu((m) => (m ? { ...m, snoozeOpen: false } : null))
                }
              >
                Back
              </button>
              <div className={styles.issueCardMenuSubheading} id="issue-snooze-heading">
                Snooze — hide until
              </div>
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  role="menuitem"
                  className={styles.issueCardMenuItem}
                  onClick={() => applySnooze(issueCardMenu.issue.id, opt.getUntil())}
                >
                  {opt.label}
                </button>
              ))}
            </>
          ) : (
            <>
          <button
            type="button"
            role="menuitem"
            className={styles.issueCardMenuItem}
            onClick={(e) => {
              e.stopPropagation();
              const q = issueCardMenu.issue;
              const x = issueCardMenu.x;
              const y = issueCardMenu.y;
              closeIssueCardMenu();
              requestAnimationFrame(() => {
                setStatusUpdateTooltip({ issue: q, x, y });
              });
            }}
          >
            Status update
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.issueCardMenuItem}
            onClick={() => {
              const q = issueCardMenu.issue;
              closeIssueCardMenu();
              setDetailIssue(q);
            }}
          >
            Open
          </button>
          {issueCardMenu.issue.status === "backlog" && (
            <button
              type="button"
              role="menuitem"
              className={styles.issueCardMenuItem}
              onClick={() => {
                const issue = issueCardMenu.issue;
                closeIssueCardMenu();
                setSpecChat({
                  mode: "specify",
                  issue,
                  item: issueToSpecChatFeaturesetItem(issue, allItems),
                });
              }}
            >
              Specify…
            </button>
          )}
          {issueCardMenu.issue.status === "in_progress" && (
            <button
              type="button"
              role="menuitem"
              className={styles.issueCardMenuItem}
              onClick={() => {
                const id = issueCardMenu.issue.id;
                closeIssueCardMenu();
                setBoardIssues((prev) =>
                  prev.map((i) =>
                    i.id === id
                      ? { ...i, status: "todo" as const, todoBotPickupAt: undefined }
                      : i,
                  ),
                );
              }}
            >
              Pause
            </button>
          )}
          {issueCardMenu.issue.status === "human_review" && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.issueCardMenuItem}
                onClick={() => {
                  const q = issueCardMenu.issue;
                  closeIssueCardMenu();
                  setViewerBranch(humanReviewBranchValue(q));
                  setViewerBranchLoadNonce((n) => n + 1);
                  setViewTab("viewer");
                }}
              >
                View branch
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.issueCardMenuItem}
                onClick={() =>
                  setIssueCardMenu((m) => (m ? { ...m, snoozeOpen: true } : null))
                }
              >
                Snooze
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.issueCardMenuItem}
                onClick={() => {
                  const issue = issueCardMenu.issue;
                  const id = issue.id;
                  closeIssueCardMenu();
                  mergeIssueSnapshotRef.current[id] = { ...issue, status: "merge" };
                  setBoardIssues((prev) =>
                    prev.map((i) => (i.id === id ? { ...i, status: "merge" as const } : i)),
                  );
                  setMergeProgressById((prev) => ({ ...prev, [id]: 0 }));
                  setDetailIssue((cur) =>
                    cur?.id === id ? { ...cur, status: "merge" } : cur,
                  );
                }}
              >
                Merge
              </button>
            </>
          )}
          <div className={styles.issueCardMenuDivider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.issueCardMenuItem} ${styles.issueCardMenuItemDestructive}`}
            onClick={() => {
              const id = issueCardMenu.issue.id;
              closeIssueCardMenu();
              setBoardIssues((prev) => prev.filter((i) => i.id !== id));
              setSnoozedUntilById((prev) => {
                const { [id]: _, ...rest } = prev;
                return rest;
              });
              setDetailIssue((cur) => (cur?.id === id ? null : cur));
            }}
          >
            Delete
          </button>
            </>
          )}
        </div>
      )}
      {statusUpdateTooltip && statusTooltipPosition && statusTooltipCopy && (
        <div
          className={styles.statusUpdateTooltip}
          role="tooltip"
          data-status-update-tooltip
          id={`status-tip-${statusUpdateTooltip.issue.id}`}
          style={{ left: statusTooltipPosition.left, top: statusTooltipPosition.top }}
        >
          <p className={styles.statusUpdateTooltipKicker}>{statusUpdateTooltip.issue.id}</p>
          <p className={styles.statusUpdateTooltipLabel}>What was requested</p>
          <p className={styles.statusUpdateTooltipBody}>{statusTooltipCopy.requested}</p>
          <p className={styles.statusUpdateTooltipLabel}>Where we are now</p>
          <p className={styles.statusUpdateTooltipBody}>{statusTooltipCopy.now}</p>
        </div>
      )}
    </div>
  );
}
