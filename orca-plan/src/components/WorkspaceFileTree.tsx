import { ChevronDown, ChevronRight, ExternalLink, File, Folder, GitBranch } from "lucide-react";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceFsEntry } from "../orcaPlanHost";
import {
  canUseWorkspaceCodingTools,
  getWorkspaceCodingStatus,
  gitInitWorkspace,
  listWorkspaceDir,
  revealWorkspacePath,
  startWorkspaceFsWatch,
  stopWorkspaceFsWatch,
  subscribeWorkspaceFsChanged,
} from "../orcaPlanHost";
import styles from "./WorkspaceFileTree.module.css";

function FsTreeNode({
  workspaceRoot,
  entry,
  depth,
  loadGen,
  expanded,
  setExpanded,
}: {
  workspaceRoot: string;
  entry: WorkspaceFsEntry;
  depth: number;
  loadGen: number;
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
}) {
  const isDir = entry.isDirectory;
  const open = isDir && expanded.has(entry.relPath);
  const [children, setChildren] = useState<WorkspaceFsEntry[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isDir || !open) return;
    let cancelled = false;
    void (async () => {
      const r = await listWorkspaceDir(workspaceRoot, entry.relPath);
      if (cancelled) return;
      if (!r.ok) {
        setListErr(r.error);
        setChildren([]);
        return;
      }
      setListErr(null);
      setChildren(r.entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, entry.relPath, isDir, open, loadGen]);

  const onToggle = () => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.relPath)) next.delete(entry.relPath);
      else next.add(entry.relPath);
      return next;
    });
  };

  const onRevealRow = () => {
    void revealWorkspacePath(workspaceRoot, entry.relPath);
  };

  const pad = depth * 12;

  return (
    <>
      <div className={styles.row} style={{ paddingLeft: 8 + pad }}>
        {isDir ? (
          <button
            type="button"
            className={styles.chevronBtn}
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
          >
            {open ? <ChevronDown size={15} strokeWidth={2} /> : <ChevronRight size={15} strokeWidth={2} />}
          </button>
        ) : (
          <span className={styles.chevronSpacer} aria-hidden />
        )}
        {isDir ? (
          <Folder size={15} strokeWidth={2} className={`${styles.icon} ${styles.iconFolder}`} aria-hidden />
        ) : (
          <File size={15} strokeWidth={2} className={styles.icon} aria-hidden />
        )}
        <span className={styles.name} title={entry.relPath}>
          {entry.name}
        </span>
        <button
          type="button"
          className={styles.revealBtn}
          title="Show in Finder / Explorer"
          aria-label={`Reveal ${entry.name} in file manager`}
          onClick={onRevealRow}
        >
          <ExternalLink size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {listErr && open ? <div className={styles.listError}>{listErr}</div> : null}
      {isDir && open && children
        ? children.map((c) => (
            <FsTreeNode
              key={c.relPath}
              workspaceRoot={workspaceRoot}
              entry={c}
              depth={depth + 1}
              loadGen={loadGen}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          ))
        : null}
    </>
  );
}

type RepoUi =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; isRepo: boolean; branch: string | null };

export function WorkspaceFileTree({
  workspaceRoot,
  projectTitle,
}: {
  workspaceRoot: string;
  projectTitle: string;
}) {
  const root = workspaceRoot.trim();
  const codingHost = canUseWorkspaceCodingTools();
  const [loadGen, setLoadGen] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [rootEntries, setRootEntries] = useState<WorkspaceFsEntry[] | null>(null);
  const [rootErr, setRootErr] = useState<string | null>(null);
  const [repoUi, setRepoUi] = useState<RepoUi>({ status: "none" });

  const refreshRepo = useCallback(async () => {
    if (!codingHost || !root) {
      setRepoUi({ status: "none" });
      return;
    }
    setRepoUi({ status: "loading" });
    let s = await getWorkspaceCodingStatus(root);
    if (!s.ok) {
      setRepoUi({ status: "error", message: s.error });
      return;
    }
    setRepoUi({
      status: "ready",
      isRepo: s.isRepo,
      branch: s.branch,
    });
  }, [codingHost, root, projectTitle]);

  useEffect(() => {
    void refreshRepo();
  }, [refreshRepo]);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    void (async () => {
      const r = await listWorkspaceDir(root, "");
      if (cancelled) return;
      if (!r.ok) {
        setRootErr(r.error);
        setRootEntries([]);
        return;
      }
      setRootErr(null);
      setRootEntries(r.entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [root, loadGen]);

  useEffect(() => {
    if (!root) return;
    void startWorkspaceFsWatch(root);
    const unsub = subscribeWorkspaceFsChanged(() => {
      setLoadGen((g) => g + 1);
    });
    return () => {
      unsub?.();
      void stopWorkspaceFsWatch();
    };
  }, [root]);

  const handleGitInit = () => {
    if (!root) return;
    void (async () => {
      const r = await gitInitWorkspace(root);
      if (!r.ok) {
        setRepoUi({ status: "error", message: r.error });
        return;
      }
      await refreshRepo();
    })();
  };

  if (!root) return null;

  const branchLabel =
    repoUi.status === "ready" && repoUi.isRepo
      ? (repoUi.branch?.trim() ? repoUi.branch : "—")
      : null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.headTitle}>Files</h2>
      </div>
      {codingHost ? (
        <div className={styles.repoSection} aria-label="Git workspace">
          {repoUi.status === "loading" || repoUi.status === "none" ? (
            <p className={styles.repoMuted}>Checking Git…</p>
          ) : repoUi.status === "error" ? (
            <p className={styles.repoError} role="alert">
              {repoUi.message}
            </p>
          ) : repoUi.isRepo ? (
            <div className={styles.repoReady}>
              <div className={styles.repoRow}>
                <GitBranch size={14} strokeWidth={2} className={styles.repoIcon} aria-hidden />
                <span className={styles.repoBranch} title="Current branch">
                  {branchLabel}
                </span>
                <span className={styles.repoPill}>repo</span>
              </div>
            </div>
          ) : (
            <div className={styles.repoReady}>
              <p className={styles.repoMuted}>No Git repository in this folder.</p>
              <button type="button" className={styles.gitInitBtn} onClick={handleGitInit}>
                Initialize Git here
              </button>
            </div>
          )}
        </div>
      ) : null}
      <div className={styles.treeScroll}>
        {rootErr ? <p className={styles.error}>{rootErr}</p> : null}
        {!rootErr && rootEntries === null ? <p className={styles.muted}>Loading…</p> : null}
        {!rootErr && rootEntries && rootEntries.length === 0 ? (
          <p className={styles.muted}>This folder is empty (or only contains ignored items).</p>
        ) : null}
        {!rootErr && rootEntries
          ? rootEntries.map((e) => (
              <FsTreeNode
                key={e.relPath}
                workspaceRoot={root}
                entry={e}
                depth={0}
                loadGen={loadGen}
                expanded={expanded}
                setExpanded={setExpanded}
              />
            ))
          : null}
      </div>
    </div>
  );
}
