const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

/** Expand leading `~/` for paths pasted from shell prompts. */
function expandWorkspacePath(input) {
  const s = typeof input === 'string' ? input.trim() : '';
  if (s.startsWith('~/')) {
    return path.join(os.homedir(), s.slice(2));
  }
  return s;
}

function resolveWorkspaceRoot(raw) {
  const expanded = expandWorkspacePath(raw);
  if (!expanded) return null;
  return path.resolve(expanded);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Names skipped in the plan file tree (heavy or noisy). `.orca-plan` is never ignored. */
const IGNORED_FS_ENTRY_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  'target',
]);

const JUNK_FS_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * @param {string | null | undefined} relRaw
 * @returns {string | null} normalized relative path, '' for root; null if invalid / escapes root
 */
function normalizeRelativePath(relRaw) {
  if (relRaw == null || relRaw === '') return '';
  if (typeof relRaw !== 'string') return null;
  const unified = relRaw.replace(/\\/g, '/').replace(/^[/]+/, '');
  if (unified === '' || unified === '.') return '';
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
  }
  return path.normalize(unified);
}

/**
 * @param {string} rootRaw
 * @param {string} relNormalized
 * @returns {string | null} absolute path, or null if outside root
 */
function safeResolvedPathUnderRoot(rootRaw, relNormalized) {
  const base = path.resolve(rootRaw);
  const joined = relNormalized ? path.join(base, relNormalized) : base;
  const resolved = path.resolve(joined);
  const relToBase = path.relative(base, resolved);
  if (relToBase.startsWith('..') || path.isAbsolute(relToBase)) return null;
  return resolved;
}

let workspaceFsWatcher = null;
let workspaceFsWatcherWin = null;
let workspaceFsWatcherDebounceTimer = null;

function stopWorkspaceFsWatcher() {
  if (workspaceFsWatcherDebounceTimer) {
    clearTimeout(workspaceFsWatcherDebounceTimer);
    workspaceFsWatcherDebounceTimer = null;
  }
  if (workspaceFsWatcher) {
    void workspaceFsWatcher.close();
    workspaceFsWatcher = null;
  }
  workspaceFsWatcherWin = null;
}

/**
 * Multiple concurrent PTY sessions.
 * Key: `${webContents.id}:${sessionKey}` where sessionKey is "plan" or an item ID.
 * Value: { child: IPty, buffer: string[], listeners: Set<webContents.id> }
 */
const ptySessions = new Map();
const PTY_BUFFER_MAX = 50000; // chars
// Track last seen buffer length per session for unread detection
const lastSeenBufferLength = new Map(); // sessionKey → number

function ptySessionKey(wcId, sessionKey) {
  return `${wcId}:${sessionKey}`;
}

function stopPtySession(key) {
  const session = ptySessions.get(key);
  if (!session) return;
  try {
    session.child.kill();
  } catch (_e) {
    /* ignore */
  }
  ptySessions.delete(key);
}

function stopAllPtyForWebContentsId(wcId) {
  for (const [key] of ptySessions) {
    if (key.startsWith(`${wcId}:`)) {
      stopPtySession(key);
    }
  }
}

// Legacy compat — used by cleanup code
function stopPtyForWebContentsId(wcId) {
  stopAllPtyForWebContentsId(wcId);
}

function parseClaudeArgs() {
  const raw = process.env.ORCA_PLAN_CLAUDE_ARGS;
  if (!raw || !String(raw).trim()) return [];
  const s = String(raw).trim();
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j) && j.every((x) => typeof x === 'string')) return j;
  } catch {
    /* use shell-style */
  }
  return s.split(/\s+/).filter(Boolean);
}

/**
 * @param {string} text
 * @param {string} label
 * @returns {{ ok: true, project: Record<string, unknown> } | { ok: false, error: string }}
 */
function parsePlanBackupJson(text, label) {
  try {
    const data = JSON.parse(text);
    if (data == null || typeof data !== 'object') {
      return { ok: false, error: `${label}: not a JSON object` };
    }
    if (data.v !== 1 || data.kind !== 'orca-plan-project-backup') {
      return { ok: false, error: `${label}: not an orca-plan-project-backup file` };
    }
    const project = data.project;
    if (!project || typeof project !== 'object') {
      return { ok: false, error: `${label}: missing project` };
    }
    if (typeof project.id !== 'string' || typeof project.title !== 'string') {
      return { ok: false, error: `${label}: invalid project id/title` };
    }
    const snap = project.snapshot;
    if (!snap || typeof snap !== 'object' || snap.v !== 1) {
      return { ok: false, error: `${label}: invalid snapshot` };
    }
    if (!Array.isArray(snap.planTracks) || !Array.isArray(snap.planItemGroups) || !Array.isArray(snap.planTrackItems)) {
      return { ok: false, error: `${label}: invalid snapshot arrays` };
    }
    /** @type {Record<string, unknown>} */
    const entry = {
      id: project.id,
      title: project.title,
      snapshot: snap,
    };
    if (typeof project.workspaceRoot === 'string' && project.workspaceRoot.trim()) {
      entry.workspaceRoot = project.workspaceRoot.trim();
    }
    return { ok: true, project: entry };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${label}: ${message}` };
  }
}

/* ---------------------------------------------------------------------------
 * Central workspace file — disk-primary persistence
 * Lives at `<userData>/workspace.json` (e.g. ~/Library/Application Support/orca-plan/workspace.json).
 * This file is the source of truth for the project list; localStorage is a browser-only fallback.
 * ---------------------------------------------------------------------------*/

function getWorkspaceFilePath() {
  return path.join(app.getPath('userData'), 'workspace.json');
}

/**
 * Read the central workspace file from disk.
 * Returns { v, projects, lastActiveProjectId } or null if missing/corrupt.
 */
async function readWorkspaceFile() {
  const fp = getWorkspaceFilePath();
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.projects)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write the central workspace file to disk.
 */
async function writeWorkspaceFile(payload) {
  const fp = getWorkspaceFilePath();
  const dir = path.dirname(fp);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

/**
 * Scan all known workspace roots from the project list for .orca-plan/plan.json backups.
 * Also scan a configurable projects directory (ORCA_PLAN_PROJECTS_DIR or ~/Documents/orca).
 * Returns an array of parsed project entries.
 */
async function scanDiskBackups(existingProjects) {
  const found = [];
  const seenRoots = new Set();

  // Collect workspace roots from existing projects
  const roots = [];
  if (Array.isArray(existingProjects)) {
    for (const p of existingProjects) {
      if (typeof p.workspaceRoot === 'string' && p.workspaceRoot.trim()) {
        roots.push(p.workspaceRoot.trim());
      }
    }
  }

  // Also scan the projects directory for subdirectories with .orca-plan/plan.json
  const projectsDir = process.env.ORCA_PLAN_PROJECTS_DIR || path.join(os.homedir(), 'Documents', 'orca');
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        roots.push(path.join(projectsDir, e.name));
      }
    }
  } catch {
    // projectsDir doesn't exist — that's fine
  }

  for (const root of roots) {
    const resolved = path.resolve(root);
    if (seenRoots.has(resolved)) continue;
    seenRoots.add(resolved);

    const backupFile = path.join(resolved, '.orca-plan', 'plan.json');
    try {
      const text = await fs.readFile(backupFile, 'utf8');
      const parsed = parsePlanBackupJson(text, backupFile);
      if (parsed.ok) {
        found.push(parsed.project);
      }
    } catch {
      // no backup for this root — skip
    }
  }

  return found;
}

/**
 * Merge disk backups into the project list.
 * Backups with a matching ID update existing entries only if the backup is newer.
 * New IDs are appended.
 */
function mergeBackupsIntoProjects(existing, backups) {
  const result = [...existing];
  for (const backup of backups) {
    const idx = result.findIndex((p) => p.id === backup.id);
    if (idx >= 0) {
      // Already have this project — skip (central file is authoritative)
      continue;
    }
    result.push(backup);
  }
  return result;
}

/** When present, load Vite dev server; otherwise load built `dist/index.html`. */
const useDevServer = process.argv.includes('--dev');
const devPort = process.env.ORCA_PLAN_DEV_PORT || (useDevServer ? '5180' : '5173');

const preloadPath = path.join(__dirname, 'preload.cjs');

/** Idempotent: removeHandler then handle for each channel (avoids missing handlers after partial failures). */
function registerIpcHandlers() {
  const channels = [
    'orca-plan:pick-workspace-folder',
    'orca-plan:get-workspace-coding-status',
    'orca-plan:git-init',
    'orca-plan:create-claude-md-stub',
    'orca-plan:write-project-backup',
    'orca-plan:fs-list',
    'orca-plan:fs-reveal',
    'orca-plan:fs-watch-start',
    'orca-plan:fs-watch-stop',
    'orca-plan:pty-spawn',
    'orca-plan:pty-write',
    'orca-plan:pty-resize',
    'orca-plan:pty-kill',
    'orca-plan:pty-connect',
    'orca-plan:pty-mark-seen',
    'orca-plan:pty-unseen-sessions',
    'orca-plan:pty-list',
    'orca-plan:host-ping',
    'orca-plan:pick-import-plan-backups',
    'orca-plan:load-workspace-from-disk',
    'orca-plan:save-workspace-to-disk',
    'orca-plan:detect-claude-session',
    'orca-plan:write-task-context',
    'orca-plan:read-screenshot',
    'orca-plan:detect-github',
    'orca-plan:ensure-plan-schema',
    'orca-plan:read-doc',
    'orca-plan:write-doc',
    'orca-plan:list-docs',
    'orca-plan:read-plan-backup',
    'orca-plan:save-plan-version',
    'orca-plan:list-plan-versions',
    'orca-plan:load-plan-version',
  ];
  for (const ch of channels) {
    ipcMain.removeHandler(ch);
  }

  ipcMain.handle('orca-plan:pick-workspace-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose project folder',
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0] ?? null;
  });

  ipcMain.handle('orca-plan:get-workspace-coding-status', async (_event, args) => {
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    if (!root) return { ok: false, error: 'Invalid path' };
    try {
      const st = await fs.stat(root);
      if (!st.isDirectory()) return { ok: false, error: 'Not a directory' };
    } catch {
      return { ok: false, error: 'Folder does not exist or is not accessible' };
    }

    const gitMarker = path.join(root, '.git');
    let isRepo = false;
    try {
      const g = await fs.stat(gitMarker);
      isRepo = g.isFile() || g.isDirectory();
    } catch {
      isRepo = false;
    }

    let branch = null;
    if (isRepo) {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: root,
          windowsHide: true,
        });
        branch = String(stdout).trim() || null;
      } catch {
        branch = null;
      }
    }

    const upper = path.join(root, 'CLAUDE.md');
    const lower = path.join(root, 'claude.md');
    let claudeMdPath = null;
    if (await pathExists(upper)) claudeMdPath = 'CLAUDE.md';
    else if (await pathExists(lower)) claudeMdPath = 'claude.md';

    return { ok: true, isRepo, branch, claudeMdPath };
  });

  ipcMain.handle('orca-plan:git-init', async (_event, args) => {
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    if (!root) return { ok: false, error: 'Invalid path' };
    try {
      await execFileAsync('git', ['init'], { cwd: root, windowsHide: true });
      console.log('[orca-plan] git init:', root);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] git init failed:', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:create-claude-md-stub', async (_event, args) => {
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    const titleRaw = typeof args?.projectTitle === 'string' ? args.projectTitle.trim() : '';
    const title = titleRaw || 'Project';
    if (!root) return { ok: false, error: 'Invalid path', created: false };

    const upper = path.join(root, 'CLAUDE.md');
    const lower = path.join(root, 'claude.md');
    if (await pathExists(upper)) return { ok: true, created: false, path: 'CLAUDE.md' };
    if (await pathExists(lower)) return { ok: true, created: false, path: 'claude.md' };

    const body = `# ${title}

Project context for Claude (and you). Claude Code and other agents typically read **CLAUDE.md** in the repository root. Edit freely; Orca Plan does not overwrite this file after creation.

## Orca Plan

The parallel plan (tracks and items) lives in the Orca Plan app and in \`.orca-plan/plan.json\` backup files—not in this document unless you merge ideas here yourself.

`;
    try {
      await fs.writeFile(upper, body, 'utf8');
      console.log('[orca-plan] Created CLAUDE.md stub:', upper);
      return { ok: true, created: true, path: 'CLAUDE.md' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message, created: false };
    }
  });

  ipcMain.handle('orca-plan:read-screenshot', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const relativePath = typeof args?.relativePath === 'string' ? args.relativePath : '';
      if (!workspaceRoot || !relativePath) return { ok: false, error: 'Invalid args' };
      if (relativePath.includes('..')) return { ok: false, error: 'Path traversal' };
      const root = path.resolve(workspaceRoot);
      const file = path.join(root, relativePath);
      // Verify it's under the workspace
      if (!file.startsWith(root)) return { ok: false, error: 'Outside workspace' };
      const data = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : 'image/png';
      return { ok: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:detect-github', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      if (!workspaceRoot) return { ok: false, error: 'Invalid args' };
      const root = path.resolve(workspaceRoot);

      // Get remote URL
      let remoteUrl;
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: root, windowsHide: true });
        remoteUrl = String(stdout).trim();
      } catch {
        return { ok: false, error: 'No git remote' };
      }

      // Parse GitHub URL (HTTPS or SSH)
      let owner, repo;
      const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
      const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
      const m = httpsMatch || sshMatch;
      if (!m) return { ok: false, error: 'Not a GitHub remote' };
      owner = m[1];
      repo = m[2];

      // Get default branch
      let defaultBranch = 'main';
      try {
        const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], { cwd: root, windowsHide: true });
        const ref = String(stdout).trim(); // e.g. "origin/main"
        defaultBranch = ref.replace(/^origin\//, '') || 'main';
      } catch {
        // fallback to main
      }

      return { ok: true, owner, repo, defaultBranch };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:ensure-plan-schema', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      if (!workspaceRoot) return { ok: false, error: 'Invalid args' };
      const root = path.resolve(workspaceRoot);
      const file = path.join(root, '.orca-plan', 'plan-schema.md');

      // Always overwrite — this is generated, not user-edited
      const schema = `# Plan Schema

This file describes the structure of \`.orca-plan/plan.json\`. Read this before editing the plan.

## File structure

\`\`\`jsonc
{
  "v": 1,
  "kind": "orca-plan-project-backup",
  "savedAt": "ISO timestamp",
  "project": {
    "id": "proj-<timestamp>-<random>",
    "title": "Project name",
    "workspaceRoot": "/absolute/path/to/repo",  // optional
    "snapshot": { /* see below */ }
  }
}
\`\`\`

## Snapshot (the plan itself)

\`\`\`jsonc
{
  "v": 1,
  "title": "Project name",
  "planTracks": [
    {
      "id": "track-<timestamp>-<random>",  // unique, keep stable
      "title": "Track name",
      "description": "Optional longer description"
    }
  ],
  "planItemGroups": [
    {
      "id": "pig-<timestamp>-<random>",
      "title": "Group label"  // visual grouping of items within a track
    }
  ],
  "planTrackItems": [
    {
      "id": "pti-<timestamp>-<random>",    // unique, keep stable
      "trackId": "track-...",               // must match a track id
      "label": "Short item name",
      "description": "Optional details",    // shown in tooltip / task context
      "itemGroupId": "pig-...",             // optional, groups items visually
      "devOrder": 1,                        // optional, integer >= 1, build priority (1 = first)
      "claudeSessionId": "uuid",           // optional, set by Orca — do not modify
      "lastNote": "Brief status note",     // optional, where work was left off
      "lastNoteAt": "ISO timestamp",       // optional, when lastNote was set
      "lastAgentActivityAt": "ISO timestamp", // optional, set when agent makes changes
      "blockedBy": ["pti-other-item-id"],  // optional, item IDs that must complete first
      "status": "backlog",                 // optional: "backlog" | "in_progress" | "review" | "done"
      "checklist": [                       // optional, sub-task checklist
        {
          "id": "cl-<timestamp>-<random>",
          "label": "Sub-task description",
          "done": false,                   // true when completed
          "evidence": ".orca-plan/screenshots/pti-xxx/check-01.png"  // optional, screenshot path
        }
      ]
    }
  ],
  "releaseLog": [
    {
      "id": "rl-<timestamp>-<random>",
      "label": "User-facing description of what changed",
      "planItemId": "pti-...",           // optional, links to a plan item
      "addedAt": "ISO timestamp",
      "released": false,                 // true once shipped
      "releasedAt": "ISO timestamp"      // optional, set when released
    }
  ]
}
\`\`\`

## Rules for editing

- **Keep existing IDs stable** — changing an ID breaks session links and version history.
- **Generate new IDs** as \`<prefix>-<Date.now()>-<5 random chars>\` (e.g. \`pti-1778769400000-mc001\`).
- **devOrder** is the suggested build sequence. 1 = build first. Set it when proposing a plan or reordering priorities.
- **claudeSessionId** is managed by Orca. Do not create or modify it.
- **itemGroupId** groups items visually within a track (e.g. "auth" items). Create a group in planItemGroups first, then reference its ID.
- **lastNote** is a brief summary of where work was left off. Update it when reaching a stopping point or switching tasks. Include \`lastNoteAt\` as an ISO timestamp.
- **status** tracks item progress: \`backlog\` (default), \`in_progress\`, \`review\`, \`done\`. Update it as work progresses.
- **blockedBy** lists item IDs that must complete before this item can start. Use it to express real dependencies. The UI computes parallel "waves" from this — wave 1 items have no blockers and can start immediately. Maximize parallelism by only adding dependencies that are truly required.
- **checklist** is a sub-task breakdown for an item. Add it when planning the implementation of an item. Set \`done: true\` as sub-tasks are completed. Set \`evidence\` to a screenshot path when you have visual proof (e.g. \`.orca-plan/screenshots/pti-xxx/check-01.png\`).
- **releaseLog** tracks what changed for release notes. Add entries when completing work — use a user-facing label, not internal jargon. Link to a planItemId when applicable. Ad-hoc entries (bug fixes, quick wins) don't need a plan item link.
- After editing, save the file. Orca watches for changes and reloads automatically.

## Related files

- \`.orca-plan/plan.json\` — the plan data (this schema describes its structure)
- \`.orca-plan/docs/vision.md\` — project vision
- \`.orca-plan/docs/architecture.md\` — technical architecture
- \`.orca-plan/tasks/<item-id>.md\` — per-item task context (generated by Orca)
- \`.orca-plan/history/\` — version snapshots (do not edit directly)
`;

      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, schema, 'utf8');
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:write-project-backup', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const payloadJson = typeof args?.payloadJson === 'string' ? args.payloadJson : '';
      if (!workspaceRoot) return { ok: false, error: 'Invalid workspace root' };
      if (!payloadJson) return { ok: false, error: 'Missing backup payload' };

      let payload;
      try {
        payload = JSON.parse(payloadJson);
      } catch {
        return { ok: false, error: 'Invalid backup JSON' };
      }
      if (payload == null || typeof payload !== 'object') return { ok: false, error: 'Invalid backup payload' };

      const root = path.resolve(workspaceRoot);
      const dir = path.join(root, '.orca-plan');
      const file = path.join(dir, 'plan.json');
      await fs.mkdir(dir, { recursive: true });

      // Merge agent-owned fields from existing file before writing,
      // so we never clobber data the agent wrote (checklist, lastNote, etc.)
      // Note: 'status' is NOT in this list — user status changes must not be reverted by the merge.
      // Agent status changes are picked up by the file watcher instead.
      const agentFields = ['checklist', 'lastNote', 'lastNoteAt', 'claudeSessionId', 'blockedBy', 'lastAgentActivityAt'];
      try {
        const existing = await fs.readFile(file, 'utf8');
        const diskData = JSON.parse(existing);
        if (diskData?.project?.snapshot?.planTrackItems && payload?.project?.snapshot?.planTrackItems) {
          const diskItems = diskData.project.snapshot.planTrackItems;
          const diskById = new Map();
          for (const item of diskItems) {
            if (item && typeof item.id === 'string') diskById.set(item.id, item);
          }
          for (const item of payload.project.snapshot.planTrackItems) {
            const diskItem = diskById.get(item.id);
            if (!diskItem) continue;
            for (const field of agentFields) {
              // Always prefer disk version for agent-owned fields
              if (diskItem[field] !== undefined && diskItem[field] !== null) {
                item[field] = diskItem[field];
              }
            }
          }
        }
      } catch {
        // No existing file or parse error — write fresh
      }

      const text = `${JSON.stringify(payload, null, 2)}\n`;
      await fs.writeFile(file, text, 'utf8');
      console.log('[orca-plan] Wrote backup:', file);
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] Backup failed:', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:fs-list', async (_event, args) => {
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    const relRaw = typeof args?.relativePath === 'string' ? args.relativePath : '';
    if (!root) return { ok: false, error: 'Invalid workspace root' };
    const rel = normalizeRelativePath(relRaw);
    if (rel === null) return { ok: false, error: 'Invalid relative path' };
    const abs = safeResolvedPathUnderRoot(root, rel);
    if (!abs) return { ok: false, error: 'Path outside workspace' };
    try {
      const st = await fs.stat(abs);
      if (!st.isDirectory()) return { ok: false, error: 'Not a directory' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
    let dirents;
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
    const entries = [];
    for (const d of dirents) {
      if (IGNORED_FS_ENTRY_NAMES.has(d.name)) continue;
      if (JUNK_FS_FILE_NAMES.has(d.name)) continue;
      const childPathNative = rel ? path.join(rel, d.name) : d.name;
      const relPath = childPathNative.split(path.sep).join('/');
      entries.push({
        name: d.name,
        isDirectory: d.isDirectory(),
        relPath,
      });
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries };
  });

  ipcMain.handle('orca-plan:fs-reveal', async (_event, args) => {
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    const relRaw = typeof args?.relativePath === 'string' ? args.relativePath : '';
    if (!root) return { ok: false, error: 'Invalid workspace root' };
    const rel = normalizeRelativePath(relRaw);
    if (rel === null) return { ok: false, error: 'Invalid relative path' };
    const abs = safeResolvedPathUnderRoot(root, rel);
    if (!abs) return { ok: false, error: 'Path outside workspace' };
    const err = await shell.openPath(abs);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });

  ipcMain.handle('orca-plan:fs-watch-start', (event, args) => {
    let chokidar;
    try {
      chokidar = require('chokidar');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] chokidar load failed:', message);
      return { ok: false, error: message };
    }
    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    if (!root) return { ok: false, error: 'Invalid path' };
    stopWorkspaceFsWatcher();
    workspaceFsWatcherWin = BrowserWindow.fromWebContents(event.sender);
    workspaceFsWatcher = chokidar.watch(root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      ignored: (p) => {
        const n = p.replace(/\\/g, '/');
        return (
          n.includes('/node_modules/') ||
          n.endsWith('/node_modules') ||
          n.includes('/.git/') ||
          n.endsWith('/.git') ||
          n.includes('/dist/') ||
          n.includes('/.next/') ||
          n.includes('/build/')
        );
      },
    });
    const notify = () => {
      if (workspaceFsWatcherDebounceTimer) clearTimeout(workspaceFsWatcherDebounceTimer);
      workspaceFsWatcherDebounceTimer = setTimeout(() => {
        workspaceFsWatcherDebounceTimer = null;
        const win = workspaceFsWatcherWin;
        if (win && !win.isDestroyed()) {
          win.webContents.send('orca-plan:fs-changed', { workspaceRoot: root });
        }
      }, 280);
    };
    workspaceFsWatcher.on('all', notify);
    return { ok: true };
  });

  ipcMain.handle('orca-plan:fs-watch-stop', async () => {
    stopWorkspaceFsWatcher();
    return { ok: true };
  });

  ipcMain.handle('orca-plan:pick-import-plan-backups', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Import from plan.json backups',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] },
      ],
      message: 'Select .orca-plan/plan.json files (same folder layout as on disk)',
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: true, projects: [], errors: [] };
    }
    const projects = [];
    const errors = [];
    for (const fp of res.filePaths) {
      const label = path.basename(fp);
      let text;
      try {
        text = await fs.readFile(fp, 'utf8');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`${label}: ${message}`);
        continue;
      }
      const parsed = parsePlanBackupJson(text, label);
      if (parsed.ok) {
        projects.push(parsed.project);
      } else {
        errors.push(parsed.error);
      }
    }
    return { ok: true, projects, errors };
  });

  ipcMain.handle('orca-plan:load-workspace-from-disk', async () => {
    try {
      const data = await readWorkspaceFile();
      const projects = data?.projects ?? [];
      const lastActiveProjectId = data?.lastActiveProjectId ?? null;

      // Scan disk backups and merge any new projects
      const backups = await scanDiskBackups(projects);
      const merged = mergeBackupsIntoProjects(projects, backups);

      // If backups added new projects, persist the merged list
      if (merged.length > projects.length) {
        await writeWorkspaceFile({ v: 1, projects: merged, lastActiveProjectId });
        console.log(`[orca-plan] Auto-imported ${merged.length - projects.length} project(s) from disk backups`);
      }

      return { ok: true, projects: merged, lastActiveProjectId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] Failed to load workspace from disk:', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:save-workspace-to-disk', async (_event, args) => {
    try {
      const projects = Array.isArray(args?.projects) ? args.projects : [];
      const lastActiveProjectId = typeof args?.lastActiveProjectId === 'string' ? args.lastActiveProjectId : null;
      await writeWorkspaceFile({ v: 1, projects, lastActiveProjectId });
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] Failed to save workspace to disk:', message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:list-docs', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      if (!workspaceRoot) return { ok: false, error: 'Invalid args' };
      const dir = path.join(path.resolve(workspaceRoot), '.orca-plan', 'docs');
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return { ok: true, docs: [] };
      }
      const docs = [];
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue;
        const content = await fs.readFile(path.join(dir, e.name), 'utf8');
        docs.push({ filename: e.name, content });
      }
      docs.sort((a, b) => a.filename.localeCompare(b.filename));
      return { ok: true, docs };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('orca-plan:read-doc', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const filename = typeof args?.filename === 'string' ? args.filename.trim() : '';
      if (!workspaceRoot || !filename || filename.includes('/') || filename.includes('..')) {
        return { ok: false, error: 'Invalid args' };
      }
      const file = path.join(path.resolve(workspaceRoot), '.orca-plan', 'docs', filename);
      const content = await fs.readFile(file, 'utf8');
      return { ok: true, content };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('orca-plan:write-doc', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const filename = typeof args?.filename === 'string' ? args.filename.trim() : '';
      const content = typeof args?.content === 'string' ? args.content : '';
      const allDocs = Array.isArray(args?.allDocFilenames) ? args.allDocFilenames : [];
      if (!workspaceRoot || !filename || filename.includes('/') || filename.includes('..')) {
        return { ok: false, error: 'Invalid args' };
      }
      const root = path.resolve(workspaceRoot);
      const dir = path.join(root, '.orca-plan', 'docs');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, filename), content, 'utf8');

      // Update CLAUDE.md references block
      if (allDocs.length > 0) {
        const claudeMdPath = path.join(root, 'CLAUDE.md');
        let claudeMd = '';
        try {
          claudeMd = await fs.readFile(claudeMdPath, 'utf8');
        } catch {
          // no CLAUDE.md yet
        }

        const startMarker = '<!-- orca-plan:docs -->';
        const endMarker = '<!-- /orca-plan:docs -->';
        const docLines = allDocs
          .filter((f) => typeof f === 'string')
          .map((f) => {
            const title = f.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return `- [${title}](.orca-plan/docs/${f})`;
          });
        const block = `${startMarker}\n## Project docs\n${docLines.join('\n')}\n\n## Plan\n- [Plan data](.orca-plan/plan.json) — the project plan (tracks, items, priorities)\n- [Plan schema](.orca-plan/plan-schema.md) — read before editing plan.json\n${endMarker}`;

        const startIdx = claudeMd.indexOf(startMarker);
        const endIdx = claudeMd.indexOf(endMarker);
        if (startIdx >= 0 && endIdx >= 0) {
          claudeMd = claudeMd.slice(0, startIdx) + block + claudeMd.slice(endIdx + endMarker.length);
        } else {
          claudeMd = claudeMd.trimEnd() + '\n\n' + block + '\n';
        }
        await fs.writeFile(claudeMdPath, claudeMd, 'utf8');
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('orca-plan:read-plan-backup', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      if (!workspaceRoot) return { ok: false, error: 'Invalid args' };
      const root = path.resolve(workspaceRoot);
      const file = path.join(root, '.orca-plan', 'plan.json');
      const text = await fs.readFile(file, 'utf8');
      const parsed = parsePlanBackupJson(text, file);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, snapshot: parsed.project.snapshot };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:save-plan-version', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const source = typeof args?.source === 'string' ? args.source : 'ui';
      const snapshotJson = typeof args?.snapshotJson === 'string' ? args.snapshotJson : '';
      if (!workspaceRoot || !snapshotJson) return { ok: false, error: 'Invalid args' };

      const root = path.resolve(workspaceRoot);
      const dir = path.join(root, '.orca-plan', 'history');
      await fs.mkdir(dir, { recursive: true });

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${ts}.json`;
      const payload = {
        v: 1,
        kind: 'orca-plan-version',
        savedAt: new Date().toISOString(),
        source,
        snapshot: JSON.parse(snapshotJson),
      };
      await fs.writeFile(path.join(dir, filename), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      return { ok: true, filename };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:list-plan-versions', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      if (!workspaceRoot) return { ok: false, error: 'Invalid args' };

      const root = path.resolve(workspaceRoot);
      const dir = path.join(root, '.orca-plan', 'history');

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return { ok: true, versions: [] };
      }

      const versions = [];
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.json')) continue;
        try {
          const text = await fs.readFile(path.join(dir, e.name), 'utf8');
          const data = JSON.parse(text);
          if (data?.kind !== 'orca-plan-version') continue;
          versions.push({
            filename: e.name,
            savedAt: data.savedAt || e.name,
            source: data.source || 'unknown',
          });
        } catch {
          continue;
        }
      }
      // newest first
      versions.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      return { ok: true, versions };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:load-plan-version', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const filename = typeof args?.filename === 'string' ? args.filename.trim() : '';
      if (!workspaceRoot || !filename) return { ok: false, error: 'Invalid args' };

      // Prevent path traversal
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return { ok: false, error: 'Invalid filename' };
      }

      const root = path.resolve(workspaceRoot);
      const file = path.join(root, '.orca-plan', 'history', filename);
      const text = await fs.readFile(file, 'utf8');
      const data = JSON.parse(text);
      if (data?.kind !== 'orca-plan-version' || !data.snapshot) {
        return { ok: false, error: 'Invalid version file' };
      }
      return { ok: true, snapshot: data.snapshot, source: data.source, savedAt: data.savedAt };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:write-task-context', async (_event, args) => {
    try {
      const workspaceRoot = expandWorkspacePath(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
      const itemId = typeof args?.itemId === 'string' ? args.itemId.trim() : '';
      const content = typeof args?.content === 'string' ? args.content : '';
      if (!workspaceRoot || !itemId) return { ok: false, error: 'Invalid args' };

      const root = path.resolve(workspaceRoot);
      const dir = path.join(root, '.orca-plan', 'tasks');
      const file = path.join(dir, `${itemId}.md`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, content, 'utf8');
      return { ok: true, path: `.orca-plan/tasks/${itemId}.md` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:detect-claude-session', async (_event, args) => {
    // Scan ~/.claude/projects/<slug>/ for .jsonl session files.
    // Returns the most recently modified session ID, or all sessions.
    try {
      const workspaceRoot = typeof args?.workspaceRoot === 'string' ? args.workspaceRoot.trim() : '';
      if (!workspaceRoot) return { ok: false, error: 'No workspace root' };

      // Claude Code uses the absolute path with / replaced by -
      const resolved = path.resolve(workspaceRoot);
      const slug = resolved.replace(/\//g, '-');
      const claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', slug);

      let entries;
      try {
        entries = await fs.readdir(claudeProjectDir, { withFileTypes: true });
      } catch {
        return { ok: true, sessions: [] };
      }

      const sessions = [];
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        const sessionId = e.name.replace(/\.jsonl$/, '');
        const stat = await fs.stat(path.join(claudeProjectDir, e.name));
        sessions.push({ id: sessionId, modifiedAt: stat.mtime.toISOString() });
      }

      // Sort newest first
      sessions.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

      return { ok: true, sessions };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('orca-plan:pty-spawn', async (event, args) => {
    let nodePty;
    try {
      nodePty = require('node-pty');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[orca-plan] node-pty load failed:', message);
      return { ok: false, error: message };
    }

    const root = resolveWorkspaceRoot(typeof args?.workspaceRoot === 'string' ? args.workspaceRoot : '');
    if (!root) return { ok: false, error: 'Invalid workspace root' };
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : 'plan';
    try {
      const st = await fs.stat(root);
      if (!st.isDirectory()) return { ok: false, error: 'Workspace is not a directory' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }

    const cols = Math.max(20, Math.min(240, Number(args?.cols) || 80));
    const rows = Math.max(5, Math.min(120, Number(args?.rows) || 24));
    const wcId = event.sender.id;
    const key = ptySessionKey(wcId, sessionKey);

    // Kill only THIS session if it already exists (not others)
    stopPtySession(key);

    const cmd = process.env.ORCA_PLAN_CLAUDE_CMD || 'claude';
    const cmdArgs = parseClaudeArgs();

    const resumeSessionId = typeof args?.resumeSessionId === 'string' ? args.resumeSessionId.trim() : '';
    if (resumeSessionId) {
      cmdArgs.push('--resume', resumeSessionId);
    }

    const systemPrompt = typeof args?.systemPrompt === 'string' ? args.systemPrompt.trim() : '';
    if (systemPrompt) {
      cmdArgs.push('--append-system-prompt', systemPrompt);
      console.log('[orca-plan] System prompt:', systemPrompt.length, 'chars');
    }

    /** @type {import('node-pty').IPty} */
    let child;
    try {
      child = nodePty.spawn(cmd, cmdArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: root,
        env: { ...process.env },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }

    const session = { child, buffer: '' };
    ptySessions.set(key, session);

    child.onData((data) => {
      const str = Buffer.isBuffer(data) ? data.toString() : String(data);
      // Append to buffer (cap size)
      session.buffer += str;
      if (session.buffer.length > PTY_BUFFER_MAX) {
        session.buffer = session.buffer.slice(-PTY_BUFFER_MAX);
      }
      if (!event.sender.isDestroyed()) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        event.sender.send('orca-plan:pty-data', { sessionKey, data: buf.toString('base64') });
      }
    });
    child.onExit(({ exitCode, signal }) => {
      if (ptySessions.get(key)?.child === child) {
        ptySessions.delete(key);
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send('orca-plan:pty-exit', { sessionKey, exitCode, signal: signal ?? null });
      }
    });

    console.log('[orca-plan] PTY spawn:', cmd, 'session=', sessionKey, 'cwd=', root);
    return { ok: true };
  });

  ipcMain.handle('orca-plan:pty-connect', (event, args) => {
    // Returns the buffered output for a session so the renderer can replay it
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : 'plan';
    const wcId = event.sender.id;
    const key = ptySessionKey(wcId, sessionKey);
    const session = ptySessions.get(key);
    if (!session) return { ok: false, exists: false };
    // Record current buffer length as "seen"
    lastSeenBufferLength.set(sessionKey, session.buffer.length);
    return { ok: true, exists: true, buffer: Buffer.from(session.buffer).toString('base64') };
  });

  ipcMain.handle('orca-plan:pty-mark-seen', (event, args) => {
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : '';
    if (sessionKey) {
      const key = ptySessionKey(event.sender.id, sessionKey);
      const session = ptySessions.get(key);
      if (session) {
        lastSeenBufferLength.set(sessionKey, session.buffer.length);
      }
    }
    return { ok: true };
  });

  ipcMain.handle('orca-plan:pty-unseen-sessions', (event) => {
    const UNSEEN_THRESHOLD = 100; // bytes of new output to count as "new activity"
    const wcId = event.sender.id;
    const prefix = `${wcId}:`;
    const unseen = [];
    for (const [key, session] of ptySessions) {
      if (!key.startsWith(prefix)) continue;
      const sessionKey = key.slice(prefix.length);
      const lastSeen = lastSeenBufferLength.get(sessionKey) ?? 0;
      if (session.buffer.length - lastSeen > UNSEEN_THRESHOLD) {
        unseen.push(sessionKey);
      }
    }
    return { ok: true, sessions: unseen };
  });

  ipcMain.handle('orca-plan:pty-list', (event) => {
    // List all active sessions for this webContents
    const wcId = event.sender.id;
    const prefix = `${wcId}:`;
    const sessions = [];
    for (const [key] of ptySessions) {
      if (key.startsWith(prefix)) {
        sessions.push(key.slice(prefix.length));
      }
    }
    return { ok: true, sessions };
  });

  ipcMain.handle('orca-plan:pty-write', (event, args) => {
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : 'plan';
    const key = ptySessionKey(event.sender.id, sessionKey);
    const session = ptySessions.get(key);
    if (!session) return { ok: false, error: 'No active session for ' + sessionKey };
    const data = typeof args?.data === 'string' ? args.data : '';
    try {
      session.child.write(data);
    } catch (_e) {
      /* ignore */
    }
    return { ok: true };
  });

  ipcMain.handle('orca-plan:pty-resize', (event, args) => {
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : 'plan';
    const key = ptySessionKey(event.sender.id, sessionKey);
    const session = ptySessions.get(key);
    if (!session) return { ok: false, error: 'No active session' };
    const cols = Math.max(20, Math.min(240, Number(args?.cols) || 80));
    const rows = Math.max(5, Math.min(120, Number(args?.rows) || 24));
    try {
      session.child.resize(cols, rows);
    } catch (_e) {
      /* ignore */
    }
    return { ok: true };
  });

  ipcMain.handle('orca-plan:pty-kill', (event, args) => {
    const sessionKey = typeof args?.sessionKey === 'string' ? args.sessionKey.trim() : '';
    if (sessionKey) {
      stopPtySession(ptySessionKey(event.sender.id, sessionKey));
    } else {
      stopAllPtyForWebContentsId(event.sender.id);
    }
    return { ok: true };
  });

  ipcMain.handle('orca-plan:host-ping', () => ({
    ok: true,
    main: __filename,
    pid: process.pid,
  }));

  console.log('[orca-plan] IPC handlers registered (pick folder, backup, git, CLAUDE.md, fs, pty)', __filename);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (useDevServer) {
    void win.loadURL(`http://127.0.0.1:${devPort}`);
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    void win.loadFile(indexHtml);
  }

  win.on('closed', () => {
    stopWorkspaceFsWatcher();
  });
}

// Register early; register again on ready so we never depend on a single timing when Electron resets IPC.
registerIpcHandlers();

void app.whenReady().then(() => {
  registerIpcHandlers();
  app.on('web-contents-created', (_e, webContents) => {
    webContents.on('destroyed', () => {
      stopPtyForWebContentsId(webContents.id);
    });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
