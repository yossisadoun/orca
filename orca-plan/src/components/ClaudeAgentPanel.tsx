import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ArrowLeft, Minus, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanProjectSnapshot, PlanTrackItem } from "../types";
import { detectClaudeSessions, ptyConnect, ptyResize, ptySpawn, ptyWrite, subscribePtyData, subscribePtyExit, writeTaskContext } from "../orcaPlanHost";
import styles from "./ClaudeAgentPanel.module.css";

/* ---------------------------------------------------------------------------
 * Presets
 * ---------------------------------------------------------------------------*/

const THEME_PRESETS: Record<string, { label: string; theme: ITheme }> = {
  midnight: {
    label: "Midnight",
    theme: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#c0c0c0",
      cursorAccent: "#1a1a2e",
      selectionBackground: "rgba(255, 255, 255, 0.15)",
      black: "#1a1a2e",
      red: "#ff6b6b",
      green: "#51cf66",
      yellow: "#ffd43b",
      blue: "#74c0fc",
      magenta: "#da77f2",
      cyan: "#66d9e8",
      white: "#e0e0e0",
      brightBlack: "#555577",
      brightRed: "#ff8787",
      brightGreen: "#69db7c",
      brightYellow: "#ffe066",
      brightBlue: "#91d5ff",
      brightMagenta: "#e599f7",
      brightCyan: "#99e9f2",
      brightWhite: "#ffffff",
    },
  },
  dark: {
    label: "Dark",
    theme: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
      cursor: "#aeafad",
      cursorAccent: "#1e1e1e",
      selectionBackground: "rgba(255, 255, 255, 0.12)",
      black: "#1e1e1e",
      red: "#f44747",
      green: "#6a9955",
      yellow: "#d7ba7d",
      blue: "#569cd6",
      magenta: "#c586c0",
      cyan: "#4ec9b0",
      white: "#d4d4d4",
      brightBlack: "#808080",
      brightRed: "#f44747",
      brightGreen: "#6a9955",
      brightYellow: "#d7ba7d",
      brightBlue: "#569cd6",
      brightMagenta: "#c586c0",
      brightCyan: "#4ec9b0",
      brightWhite: "#ffffff",
    },
  },
  light: {
    label: "Light",
    theme: {
      background: "#fcfcfc",
      foreground: "#24292e",
      cursor: "#24292e",
      cursorAccent: "#fcfcfc",
      selectionBackground: "rgba(0, 0, 0, 0.10)",
      black: "#24292e",
      red: "#d73a49",
      green: "#22863a",
      yellow: "#b08800",
      blue: "#0366d6",
      magenta: "#6f42c1",
      cyan: "#0598bc",
      white: "#f6f8fa",
      brightBlack: "#6a737d",
      brightRed: "#cb2431",
      brightGreen: "#28a745",
      brightYellow: "#dbab09",
      brightBlue: "#2188ff",
      brightMagenta: "#8a63d2",
      brightCyan: "#3192aa",
      brightWhite: "#fafbfc",
    },
  },
  monokai: {
    label: "Monokai",
    theme: {
      background: "#272822",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#272822",
      selectionBackground: "rgba(255, 255, 255, 0.12)",
      black: "#272822",
      red: "#f92672",
      green: "#a6e22e",
      yellow: "#f4bf75",
      blue: "#66d9ef",
      magenta: "#ae81ff",
      cyan: "#a1efe4",
      white: "#f8f8f2",
      brightBlack: "#75715e",
      brightRed: "#f92672",
      brightGreen: "#a6e22e",
      brightYellow: "#f4bf75",
      brightBlue: "#66d9ef",
      brightMagenta: "#ae81ff",
      brightCyan: "#a1efe4",
      brightWhite: "#f9f8f5",
    },
  },
};

const FONT_SIZES = [11, 12, 13, 14, 15, 16];
const DEFAULT_THEME_KEY = "light";
const DEFAULT_FONT_SIZE = 13;

const STORAGE_KEY = "orca-plan.terminal-settings";

type TermSettings = { themeKey: string; fontSize: number };

function loadSettings(): TermSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { themeKey: DEFAULT_THEME_KEY, fontSize: DEFAULT_FONT_SIZE };
    const o = JSON.parse(raw);
    return {
      themeKey: typeof o.themeKey === "string" && o.themeKey in THEME_PRESETS ? o.themeKey : DEFAULT_THEME_KEY,
      fontSize: typeof o.fontSize === "number" && FONT_SIZES.includes(o.fontSize) ? o.fontSize : DEFAULT_FONT_SIZE,
    };
  } catch {
    return { themeKey: DEFAULT_THEME_KEY, fontSize: DEFAULT_FONT_SIZE };
  }
}

function saveSettings(s: TermSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ---------------------------------------------------------------------------
 * Plan context builder
 * ---------------------------------------------------------------------------*/

function buildItemContextMarkdown(item: PlanTrackItem, snapshot: PlanProjectSnapshot): string {
  const track = snapshot.planTracks.find((t) => t.id === item.trackId);
  const siblingsInTrack = snapshot.planTrackItems.filter((i) => i.trackId === item.trackId && i.id !== item.id);
  const lines: string[] = [];
  lines.push(`# Task: ${item.label}`);
  lines.push("");
  lines.push(`**Project:** ${snapshot.title}`);
  lines.push(`**Track:** ${track?.title ?? "Unknown"}`);
  if (item.description) {
    lines.push("");
    lines.push("## Description");
    lines.push("");
    lines.push(item.description);
  }
  if (siblingsInTrack.length > 0) {
    lines.push("");
    lines.push("## Other items in this track");
    lines.push("");
    for (const s of siblingsInTrack) {
      lines.push(`- ${s.label}${s.description ? ` — ${s.description}` : ""}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("Focus on this specific task. The full project plan is in `.orca-plan/plan.json` if you need broader context.");
  lines.push("");
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------------*/

export function ClaudeAgentPanel({
  workspaceRoot,
  snapshot,
  activeItem,
  github,
  onBackToProject,
  onSessionDetected,
  onMinimize,
}: {
  workspaceRoot: string;
  snapshot: PlanProjectSnapshot;
  activeItem?: PlanTrackItem | null;
  github?: { owner: string; repo: string; defaultBranch: string };
  onBackToProject?: () => void;
  onMinimize?: () => void;
  /** Called when a Claude session ID is detected for this chat. */
  onSessionDetected?: (sessionId: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  const [settings, setSettings] = useState<TermSettings>(loadSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const applySettings = useCallback((next: TermSettings) => {
    setSettings(next);
    saveSettings(next);
    const term = termRef.current;
    if (!term) return;
    const preset = THEME_PRESETS[next.themeKey] ?? THEME_PRESETS[DEFAULT_THEME_KEY];
    term.options.theme = preset.theme;
    term.options.fontSize = next.fontSize;
    // Trigger refit after font size change
    const el = wrapRef.current;
    if (el) {
      el.dispatchEvent(new Event("resize"));
    }
  }, []);

  // Session key: "plan" for project-level, item ID for item-level
  const sessionKey = activeItem?.id ?? "plan";

  useEffect(() => {
    const root = workspaceRoot.trim();
    const el = wrapRef.current;
    if (!root || !el) return;

    const s = loadSettings();
    const preset = THEME_PRESETS[s.themeKey] ?? THEME_PRESETS[DEFAULT_THEME_KEY];
    const term = new Terminal({
      cursorBlink: true,
      fontSize: s.fontSize,
      lineHeight: 1.35,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: preset.theme,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);

    const waitForSize = (): Promise<void> => {
      return new Promise((resolve) => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) { resolve(); return; }
        const observer = new ResizeObserver(() => {
          if (el.offsetWidth > 0 && el.offsetHeight > 0) { observer.disconnect(); resolve(); }
        });
        observer.observe(el);
      });
    };

    let unsubData: (() => void) | null | undefined;
    let unsubExit: (() => void) | null | undefined;
    let termOpened = false;

    // Filter PTY events to only this session
    unsubData = subscribePtyData((sk, u8) => {
      if (sk !== sessionKey) return;
      if (termOpened) { term.write(u8); }
    }) ?? undefined;
    unsubExit = subscribePtyExit((sk, { exitCode, signal }) => {
      if (sk !== sessionKey) return;
      const sig = signal != null ? ` signal ${signal}` : "";
      term.write(`\r\n\x1b[90m[exit ${exitCode}${sig}]\x1b[0m\r\n`);
    }) ?? undefined;

    term.onData((data) => {
      void ptyWrite(sessionKey, data);
    });

    let cancelled = false;
    void (async () => {
      await waitForSize();
      if (cancelled) return;

      term.open(el);
      termOpened = true;

      // Try to reconnect to an existing session (replay buffer)
      const existing = await ptyConnect(sessionKey);
      if (existing.ok) {
        // Session exists — replay buffered output
        const buf = Uint8Array.from(atob(existing.buffer), (c) => c.charCodeAt(0));
        if (buf.length > 0) term.write(buf);

        fit.fit();
        const d = fit.proposeDimensions();
        if (d) void ptyResize(sessionKey, d.cols, d.rows);
      } else {
        // No existing session — spawn a new one
        fit.fit();
        const initial = fit.proposeDimensions();

        const sessionsBefore = await detectClaudeSessions(root);
        const beforeIds = new Set(sessionsBefore.map((s) => s.id));

        const resumeId = activeItem?.claudeSessionId;

        if (activeItem) {
          const content = buildItemContextMarkdown(activeItem, snapshot);
          void writeTaskContext(root, activeItem.id, content);
        }

        let systemPrompt: string | undefined;
        if (activeItem) {
          const ctx = buildItemContextMarkdown(activeItem, snapshot);
          systemPrompt = `You are working on a specific task in this project. Here is your assignment:

${ctx}

IMPORTANT:
- This conversation is scoped to the task above. Stay focused on it.
- The task context file is also saved at .orca-plan/tasks/${activeItem.id}.md
- The full project plan is at .orca-plan/plan.json (read .orca-plan/plan-schema.md for the schema)
- You can edit plan.json to update this item's status, description, or devOrder
- When you finish work on this item, set its status to "review" (never "done" — only the user marks items done)
- When reaching a stopping point, update this item's \`lastNote\` and \`lastNoteAt\` in plan.json with a brief summary of where we left off
- Project docs are at .orca-plan/docs/vision.md and .orca-plan/docs/architecture.md${github ? `
- GitHub repo: ${github.owner}/${github.repo} (default branch: ${github.defaultBranch})` : ""}`;
        } else {
          systemPrompt = `You are the project-level planning agent for this workspace.

You have FULL read/write access to the project plan at .orca-plan/plan.json.
Read .orca-plan/plan-schema.md for the schema before editing.

You CAN and SHOULD directly edit .orca-plan/plan.json to:
- Add, remove, or rename tracks
- Add, remove, or rename plan items
- Set devOrder on items (integer >= 1, build priority — 1 = first)
- Set blockedBy on items (array of item IDs that must complete first) — maximize parallelism by only adding truly required dependencies
- Set status on items: "backlog", "in_progress", "review" (never set "done" — only the user can mark items done)
- Reorder items and tracks
- Add descriptions to items and tracks
- Group items with itemGroupId

You can also read and update:
- .orca-plan/docs/vision.md — project vision
- .orca-plan/docs/architecture.md — technical architecture

After editing plan.json, the UI updates automatically. Don't ask if you can edit — just do it when appropriate.${github ? `

GitHub repo: ${github.owner}/${github.repo} (default branch: ${github.defaultBranch})
You can use git to push, create branches, etc. The remote is already configured.` : ""}`;
        }

        const r = await ptySpawn({
          workspaceRoot: root,
          cols: initial?.cols ?? 80,
          rows: initial?.rows ?? 24,
          sessionKey,
          resumeSessionId: resumeId,
          systemPrompt,
        });
        if (cancelled) return;
        if (!r.ok) {
          term.writeln(`\x1b[31m${r.error}\x1b[0m`);
          return;
        }
        fit.fit();
        const d = fit.proposeDimensions();
        if (d) void ptyResize(sessionKey, d.cols, d.rows);

        // Auto-send first message for new item sessions
        if (activeItem && !resumeId) {
          const track = snapshot.planTracks.find((t) => t.id === activeItem.trackId);
          const siblings = snapshot.planTrackItems
            .filter((i) => i.trackId === activeItem.trackId && i.id !== activeItem.id)
            .map((i) => i.label);
          const lines = [
            `I'm working on: "${activeItem.label}"`,
            track ? `Track: ${track.title}` : "",
            activeItem.description ? `Description: ${activeItem.description}` : "",
            siblings.length > 0 ? `Other items in this track: ${siblings.join(", ")}` : "",
            "",
            `Read .orca-plan/docs/vision.md and .orca-plan/docs/architecture.md for project context.`,
            `The plan is at .orca-plan/plan.json (schema at .orca-plan/plan-schema.md).`,
            "",
            `Let's discuss the approach for this item. Once we agree on a plan, create a checklist for it in plan.json.`,
          ].filter(Boolean).join("\n");

          // Wait for Claude Code to show its prompt, then send
          setTimeout(() => {
            if (cancelled) return;
            void ptyWrite(sessionKey, lines + "\n");
          }, 4000);
        }

        // Detect new session ID
        if (onSessionDetected && !resumeId) {
          setTimeout(async () => {
            if (cancelled) return;
            const sessionsAfter = await detectClaudeSessions(root);
            const newSession = sessionsAfter.find((s) => !beforeIds.has(s.id));
            if (newSession) onSessionDetected(newSession.id);
          }, 3000);
        }
      }

      // Focus
      requestAnimationFrame(() => {
        term.focus();
        const ta = el.querySelector("textarea.xterm-helper-textarea") as HTMLTextAreaElement | null;
        ta?.focus();
      });
    })();

    const ro = new ResizeObserver(() => {
      if (!termOpened) return;
      fit.fit();
      const d = fit.proposeDimensions();
      if (d) void ptyResize(sessionKey, d.cols, d.rows);
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      unsubData?.();
      unsubExit?.();
      // DON'T kill the PTY — just disconnect. It keeps running in the background.
      term.dispose();
      termRef.current = null;
    };
  }, [workspaceRoot, sessionKey]);

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        {activeItem && onBackToProject ? (
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBackToProject}
            title="Back to project chat"
          >
            <ArrowLeft size={14} strokeWidth={2} />
          </button>
        ) : null}
        <h2 className={styles.headTitle}>
          {activeItem ? activeItem.label : "Master Plan"}
        </h2>
        <div className={styles.headActions} ref={menuRef}>
          {onMinimize ? (
            <button
              type="button"
              className={styles.settingsBtn}
              onClick={onMinimize}
              title="Minimize"
            >
              <Minus size={14} strokeWidth={2} />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.settingsBtn}
            aria-label="Terminal settings"
            title="Terminal settings"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Settings size={14} strokeWidth={2} />
          </button>
          {menuOpen ? (
            <div className={styles.settingsMenu}>
              <div className={styles.menuSection}>
                <span className={styles.menuLabel}>Theme</span>
                <div className={styles.menuOptions}>
                  {Object.entries(THEME_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.menuOptionBtn} ${key === settings.themeKey ? styles.menuOptionActive : ""}`}
                      onClick={() => applySettings({ ...settings, themeKey: key })}
                    >
                      <span
                        className={styles.themePreview}
                        style={{ background: p.theme.background, borderColor: p.theme.foreground }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.menuSection}>
                <span className={styles.menuLabel}>Font size</span>
                <div className={styles.menuOptions}>
                  {FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`${styles.menuOptionBtn} ${sz === settings.fontSize ? styles.menuOptionActive : ""}`}
                      onClick={() => applySettings({ ...settings, fontSize: sz })}
                    >
                      {sz}px
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.termWrap} ref={wrapRef} />
    </div>
  );
}
