import { ChevronDown, GitBranch, GitMerge, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FeaturesetItem } from "../data/featureset";
import { viewerMockInputPlaceholder, viewerMockTodos } from "../data/viewerMockApp";
import { viewerFeatureAnchors } from "../data/viewerFeatureAnchors";
import type { Issue } from "../types";
import { viewerBranchOptionsFromIssues } from "../utils/viewerBranchOptions";
import styles from "./AppViewerPanel.module.css";

export function AppViewerPanel({
  featuresetItems,
  issues,
  branch,
  onBranchChange,
  branchLoadNonce = 0,
  onMergeHumanReviewBranch,
}: {
  featuresetItems: FeaturesetItem[];
  issues: Issue[];
  branch: string;
  onBranchChange: (value: string) => void;
  /** Increment when opening Viewer from Control Center “View” (plays load bar even if branch unchanged). */
  branchLoadNonce?: number;
  /**
   * When current branch is a Human Review feature branch, merges that ticket (Control Center + merge column flow).
   */
  onMergeHumanReviewBranch?: () => void;
}) {
  const [calloutsOn, setCalloutsOn] = useState(true);
  const { release, humanReview } = useMemo(() => viewerBranchOptionsFromIssues(issues), [issues]);
  const itemsLeft = viewerMockTodos.filter((t) => !t.done).length;

  const branchValid = useMemo(
    () => [...release, ...humanReview].some((o) => o.value === branch),
    [branch, release, humanReview],
  );

  useEffect(() => {
    if (!branchValid) onBranchChange("main");
  }, [branchValid, onBranchChange]);

  const selectBranch = branchValid ? branch : "main";

  const [branchLoading, setBranchLoading] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  const triggerLabel = useMemo(() => {
    const cur = [...release, ...humanReview].find((o) => o.value === selectBranch);
    return cur?.label ?? selectBranch;
  }, [release, humanReview, selectBranch]);

  useEffect(() => {
    if (!branchLoading) return;
    const id = window.setTimeout(() => setBranchLoading(false), 1400);
    return () => window.clearTimeout(id);
  }, [branchLoading, selectBranch]);

  const branchLoadCycleSkip = useRef(true);
  useEffect(() => {
    if (branchLoadCycleSkip.current) {
      branchLoadCycleSkip.current = false;
      return;
    }
    setBranchLoading(true);
  }, [selectBranch]);

  useEffect(() => {
    if (branchLoadNonce < 1) return;
    setBranchLoading(true);
  }, [branchLoadNonce]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = branchMenuRef.current;
      if (el && !el.contains(e.target as Node)) setBranchMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBranchMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [branchMenuOpen]);

  const pickBranch = (value: string) => {
    setBranchMenuOpen(false);
    if (value === selectBranch) return;
    onBranchChange(value);
  };

  return (
    <div className={styles.viewerRoot}>
      <div className={styles.viewerToolbar}>
        <div className={styles.viewerToolbarLeft}>
          <p className={styles.viewerToolbarTitle}>
            Preview: <strong>todos</strong> — minimal mock, not this workspace
          </p>
          <div className={styles.viewerBranchRow}>
            <div className={styles.viewerBranchWrap}>
              <span className={styles.viewerBranchFieldLabel}>Feature branch</span>
              <div ref={branchMenuRef} className={styles.viewerBranchAnchor}>
              <button
                type="button"
                className={`${styles.viewerBranchTrigger} ${branchMenuOpen ? styles.viewerBranchTriggerOpen : ""}`}
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
                aria-label={`Feature branch: ${triggerLabel}`}
                onClick={() => setBranchMenuOpen((v) => !v)}
              >
                <GitBranch className={styles.viewerBranchTriggerIcon} size={14} strokeWidth={1.75} aria-hidden />
                <span className={styles.viewerBranchTriggerText}>{triggerLabel}</span>
                <ChevronDown
                  className={`${styles.viewerBranchTriggerChevron} ${branchMenuOpen ? styles.viewerBranchTriggerChevronOpen : ""}`}
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
              {branchMenuOpen && (
                <div
                  className={styles.viewerBranchMenu}
                  role="menu"
                  aria-label="Choose branch"
                  data-viewer-branch-menu
                >
                  <div className={styles.viewerBranchMenuHeading}>Release</div>
                  {release.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectBranch === o.value}
                      className={`${styles.viewerBranchMenuItem} ${selectBranch === o.value ? styles.viewerBranchMenuItemChecked : ""}`}
                      onClick={() => pickBranch(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                  {humanReview.length > 0 && (
                    <>
                      <div className={styles.viewerBranchMenuDivider} role="separator" />
                      <div className={styles.viewerBranchMenuHeading}>Human review</div>
                      {humanReview.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectBranch === o.value}
                          className={`${styles.viewerBranchMenuItem} ${selectBranch === o.value ? styles.viewerBranchMenuItemChecked : ""}`}
                          onClick={() => pickBranch(o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {onMergeHumanReviewBranch ? (
            <button
              type="button"
              className={styles.viewerMergeBtn}
              aria-label="Merge this human review branch and return to Control Center"
              onClick={onMergeHumanReviewBranch}
            >
              <GitMerge size={14} strokeWidth={1.75} aria-hidden className={styles.viewerMergeBtnIcon} />
              Merge
            </button>
          ) : null}
          </div>
        </div>
        <label className={styles.viewerToggle}>
          <Sparkles className={styles.viewerToggleGlow} size={16} strokeWidth={1.75} aria-hidden />
          <span>Feature callouts</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={calloutsOn}
            checked={calloutsOn}
            onChange={(e) => setCalloutsOn(e.target.checked)}
          />
          <span className={styles.viewerToggleTrack}>
            <span className={styles.viewerToggleThumb} />
          </span>
        </label>
      </div>

      <div
        className={styles.viewerStage}
        aria-busy={branchLoading}
      >
        {branchLoading && (
          <div
            className={styles.viewerLoadBar}
            role="status"
            aria-live="polite"
            aria-label="Loading preview"
          >
            <div
              key={selectBranch}
              className={styles.viewerLoadBarFill}
              onAnimationEnd={() => setBranchLoading(false)}
            />
          </div>
        )}
        <div
          className={`${styles.mockApp} ${branchLoading ? styles.mockAppCleared : ""}`}
          role="img"
          aria-label="Mock minimal todos interface"
          aria-hidden={branchLoading}
        >
          <div className={styles.mockTodoCanvas}>
            <h1 className={styles.mockTodoHero}>todos</h1>
            <div className={styles.mockTodoCard}>
              <div className={styles.mockTodoInputRow}>
                <span className={styles.mockTodoChevron} aria-hidden>
                  <ChevronDown size={18} strokeWidth={1.15} />
                </span>
                <span className={styles.mockTodoPlaceholder}>{viewerMockInputPlaceholder}</span>
              </div>
              <ul className={styles.mockTodoList}>
                {viewerMockTodos.map((todo) => (
                  <li key={todo.title} className={styles.mockTodoItem}>
                    <span className={styles.mockTodoRing} aria-hidden />
                    <span className={styles.mockTodoLabel}>{todo.title}</span>
                  </li>
                ))}
              </ul>
              <footer className={styles.mockTodoFooter}>
                <span className={styles.mockTodoCount}>
                  {itemsLeft} {itemsLeft === 1 ? "item" : "items"} left
                </span>
                <div className={styles.mockTodoFilters}>
                  <span
                    className={`${styles.mockTodoFilter} ${styles.mockTodoFilterActive}`}
                    aria-current="true"
                  >
                    All
                  </span>
                  <span className={styles.mockTodoFilter}>Active</span>
                  <span className={styles.mockTodoFilter}>Completed</span>
                </div>
              </footer>
            </div>
            <div className={styles.mockTodoStack} aria-hidden>
              <div className={styles.mockTodoStackLine} />
              <div className={styles.mockTodoStackLine} />
              <div className={styles.mockTodoStackLine} />
            </div>
            {calloutsOn && (
              <div className={styles.viewerCallouts} aria-hidden>
                {featuresetItems.map((item) => {
                  const anchor = viewerFeatureAnchors[item.id];
                  if (!anchor) return null;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={styles.viewerCallout}
                      style={{ top: anchor.top, left: anchor.left }}
                    >
                      <Icon size={15} strokeWidth={1.75} aria-hidden />
                      <div
                        className={styles.viewerCalloutTooltip}
                        role="tooltip"
                      >
                        <span className={styles.viewerCalloutTooltipTitle}>{item.label}</span>
                        <p className={styles.viewerCalloutTooltipDesc}>{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
