/** Editable in-progress bot behavior for the local demo (Tune automation). */

/** Wall-clock target for one bot to reach 100% in In progress (fixed tick interval). */
export type InProgressSecondsPerBot = 5 | 7 | 10;

export interface DemoTuning {
  /**
   * Chance (0–1) each agent tick that a random eligible bot on an In progress card
   * becomes stuck (after small warmup progress). 0 = no random stucks.
   */
  inProgressBotFailProbability: number;
  inProgressSecondsPerBot: InProgressSecondsPerBot;
}

export const DEFAULT_DEMO_TUNING: DemoTuning = {
  inProgressBotFailProbability: 0.2,
  inProgressSecondsPerBot: 7,
};

/** Fixed interval for in-progress agent ticks (not user-configurable). */
export const IN_PROGRESS_AGENT_TICK_MS = 200;

/**
 * Progress increase per tick so a single bot reaches 100% in roughly
 * `secondsPerBot` wall time at {@link IN_PROGRESS_AGENT_TICK_MS}.
 */
export function agentProgressPerTickForDuration(secondsPerBot: InProgressSecondsPerBot): number {
  const ticks = Math.max(1, Math.round((secondsPerBot * 1000) / IN_PROGRESS_AGENT_TICK_MS));
  return 100 / ticks;
}

/**
 * Other board automation (todo pickup, WIP cap, merge column) — not in Tune automation UI.
 */
export const FIXED_DEMO_BOARD_AUTOMATION = {
  todoPickupDelayMs: 2_000,
  /** Hard cap on concurrent In progress cards (not configurable in Tune automation). */
  maxInProgress: 3,
  blockedVariantOnPickupPercent: 0,
  mergeTickIntervalMs: 48,
  mergeProgressPerTick: 3.5,
} as const;

const STORAGE_KEY = "orca.demoTuning.v2";

interface StoredV2 {
  v: 2;
  inProgressBotFailProbability?: unknown;
  inProgressSecondsPerBot?: unknown;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const SECONDS_CHOICES: InProgressSecondsPerBot[] = [5, 7, 10];

export const IN_PROGRESS_SECONDS_OPTIONS = SECONDS_CHOICES;

function parseSeconds(raw: unknown): InProgressSecondsPerBot {
  if (raw === 5 || raw === 7 || raw === 10) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const rounded = Math.round(raw);
    if (SECONDS_CHOICES.includes(rounded as InProgressSecondsPerBot)) {
      return rounded as InProgressSecondsPerBot;
    }
  }
  return DEFAULT_DEMO_TUNING.inProgressSecondsPerBot;
}

/** Returns persisted tuning merged with defaults (invalid fields ignored). */
export function loadDemoTuning(): DemoTuning {
  const d = DEFAULT_DEMO_TUNING;
  if (typeof window === "undefined") return { ...d };
  try {
    const rawJson = localStorage.getItem(STORAGE_KEY);
    if (!rawJson) return { ...d };
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isRecord(parsed)) return { ...d };
    if (parsed.v !== 2) return { ...d };
    const row = parsed as unknown as StoredV2;
    const failRaw = row.inProgressBotFailProbability;
    const fail =
      typeof failRaw === "number" && Number.isFinite(failRaw)
        ? clamp(failRaw, 0, 1)
        : d.inProgressBotFailProbability;
    return {
      inProgressBotFailProbability: fail,
      inProgressSecondsPerBot: parseSeconds(row.inProgressSecondsPerBot),
    };
  } catch {
    return { ...d };
  }
}

/** Normalize before save. */
export function normalizeDemoTuning(t: DemoTuning): DemoTuning {
  return {
    inProgressBotFailProbability: clamp(t.inProgressBotFailProbability, 0, 1),
    inProgressSecondsPerBot: parseSeconds(t.inProgressSecondsPerBot),
  };
}

export function saveDemoTuning(t: DemoTuning): void {
  if (typeof window === "undefined") return;
  try {
    const n = normalizeDemoTuning(t);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 2,
        inProgressBotFailProbability: n.inProgressBotFailProbability,
        inProgressSecondsPerBot: n.inProgressSecondsPerBot,
      } satisfies StoredV2),
    );
  } catch {
    /* quota */
  }
}

/** @internal Try legacy v1 key once so existing users get defaults without stale shape. */
function migrateLegacyV1IfPresent(): void {
  if (typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem("orca.demoTuning.v1");
    if (!legacy) return;
    const parsed = JSON.parse(legacy) as unknown;
    if (isRecord(parsed) && parsed.v === 1) {
      localStorage.removeItem("orca.demoTuning.v1");
    }
  } catch {
    /* ignore */
  }
}

migrateLegacyV1IfPresent();
