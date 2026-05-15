const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orcaPlan', {
  pickWorkspaceFolder: () => ipcRenderer.invoke('orca-plan:pick-workspace-folder'),
  writeProjectBackup: (workspaceRoot, payload) =>
    ipcRenderer.invoke('orca-plan:write-project-backup', {
      workspaceRoot,
      payloadJson: JSON.stringify(payload),
    }),
  getWorkspaceCodingStatus: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:get-workspace-coding-status', { workspaceRoot }),
  gitInitWorkspace: (workspaceRoot) => ipcRenderer.invoke('orca-plan:git-init', { workspaceRoot }),
  createClaudeMdStub: (workspaceRoot, projectTitle) =>
    ipcRenderer.invoke('orca-plan:create-claude-md-stub', { workspaceRoot, projectTitle }),
  listWorkspaceDir: (workspaceRoot, relativePath) =>
    ipcRenderer.invoke('orca-plan:fs-list', { workspaceRoot, relativePath }),
  revealWorkspacePath: (workspaceRoot, relativePath) =>
    ipcRenderer.invoke('orca-plan:fs-reveal', { workspaceRoot, relativePath }),
  startWorkspaceFsWatch: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:fs-watch-start', { workspaceRoot }),
  stopWorkspaceFsWatch: () => ipcRenderer.invoke('orca-plan:fs-watch-stop'),
  onWorkspaceFsChanged: (callback) => {
    const handler = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('orca-plan:fs-changed', handler);
    return () => ipcRenderer.removeListener('orca-plan:fs-changed', handler);
  },
  ptySpawn: (opts) => ipcRenderer.invoke('orca-plan:pty-spawn', opts),
  ptyConnect: (sessionKey) => ipcRenderer.invoke('orca-plan:pty-connect', { sessionKey }),
  ptyList: () => ipcRenderer.invoke('orca-plan:pty-list'),
  ptyWrite: (sessionKey, data) => ipcRenderer.invoke('orca-plan:pty-write', { sessionKey, data }),
  ptyResize: (sessionKey, cols, rows) => ipcRenderer.invoke('orca-plan:pty-resize', { sessionKey, cols, rows }),
  ptyKill: (sessionKey) => ipcRenderer.invoke('orca-plan:pty-kill', { sessionKey: sessionKey || '' }),
  hostPing: () => ipcRenderer.invoke('orca-plan:host-ping'),
  pickImportPlanBackups: () => ipcRenderer.invoke('orca-plan:pick-import-plan-backups'),
  loadWorkspaceFromDisk: () => ipcRenderer.invoke('orca-plan:load-workspace-from-disk'),
  detectClaudeSession: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:detect-claude-session', { workspaceRoot }),
  writeTaskContext: (workspaceRoot, itemId, content) =>
    ipcRenderer.invoke('orca-plan:write-task-context', { workspaceRoot, itemId, content }),
  ensurePlanSchema: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:ensure-plan-schema', { workspaceRoot }),
  listDocs: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:list-docs', { workspaceRoot }),
  readDoc: (workspaceRoot, filename) =>
    ipcRenderer.invoke('orca-plan:read-doc', { workspaceRoot, filename }),
  writeDoc: (workspaceRoot, filename, content, allDocFilenames) =>
    ipcRenderer.invoke('orca-plan:write-doc', { workspaceRoot, filename, content, allDocFilenames }),
  readPlanBackup: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:read-plan-backup', { workspaceRoot }),
  savePlanVersion: (workspaceRoot, source, snapshotJson) =>
    ipcRenderer.invoke('orca-plan:save-plan-version', { workspaceRoot, source, snapshotJson }),
  listPlanVersions: (workspaceRoot) =>
    ipcRenderer.invoke('orca-plan:list-plan-versions', { workspaceRoot }),
  loadPlanVersion: (workspaceRoot, filename) =>
    ipcRenderer.invoke('orca-plan:load-plan-version', { workspaceRoot, filename }),
  saveWorkspaceToDisk: (projects, lastActiveProjectId) =>
    ipcRenderer.invoke('orca-plan:save-workspace-to-disk', { projects, lastActiveProjectId }),
  onPtyData: (callback) => {
    const handler = (_event, payload) => {
      const buf = Buffer.from(payload.data, 'base64');
      callback(payload.sessionKey, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    };
    ipcRenderer.on('orca-plan:pty-data', handler);
    return () => ipcRenderer.removeListener('orca-plan:pty-data', handler);
  },
  onPtyExit: (callback) => {
    const handler = (_event, payload) => callback(payload.sessionKey, payload);
    ipcRenderer.on('orca-plan:pty-exit', handler);
    return () => ipcRenderer.removeListener('orca-plan:pty-exit', handler);
  },
});
