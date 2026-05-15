import type { PlanTrackItem } from "../types";

/**
 * Compute parallel execution waves from item dependencies.
 * Wave 1 = items with no blockers (can start immediately).
 * Wave N = items whose blockers are all in waves < N.
 * Items with circular dependencies or missing blockers get wave = Infinity.
 *
 * Returns a Map<itemId, waveNumber>.
 */
export function computeWaves(items: PlanTrackItem[]): Map<string, number> {
  const itemIds = new Set(items.map((i) => i.id));
  const waves = new Map<string, number>();

  // Items with no blockers (or blockers that don't exist) = wave 1
  const remaining = new Set<string>();
  for (const item of items) {
    const blockers = (item.blockedBy ?? []).filter((id) => itemIds.has(id));
    if (blockers.length === 0) {
      waves.set(item.id, 1);
    } else {
      remaining.add(item.id);
    }
  }

  // Iteratively resolve: an item's wave = max(blocker waves) + 1
  let changed = true;
  let maxIterations = items.length;
  while (changed && maxIterations-- > 0) {
    changed = false;
    for (const id of remaining) {
      const item = items.find((i) => i.id === id)!;
      const blockers = (item.blockedBy ?? []).filter((bid) => itemIds.has(bid));
      const blockerWaves = blockers.map((bid) => waves.get(bid));

      if (blockerWaves.every((w) => w !== undefined)) {
        const maxBlockerWave = Math.max(...(blockerWaves as number[]));
        waves.set(id, maxBlockerWave + 1);
        remaining.delete(id);
        changed = true;
      }
    }
  }

  // Anything still remaining has circular deps — assign Infinity
  for (const id of remaining) {
    waves.set(id, Infinity);
  }

  return waves;
}

/**
 * Check if an item is "ready" — all its blockers are done or don't exist.
 * For now, "done" means the item has a checklist where all items are checked,
 * or the item has no checklist (simple items are considered done when they have no blockers).
 * This is a simple heuristic; could be improved with an explicit "done" status field later.
 */
export function isItemReady(item: PlanTrackItem, allItems: PlanTrackItem[]): boolean {
  const blockers = item.blockedBy ?? [];
  if (blockers.length === 0) return true;

  const itemsById = new Map(allItems.map((i) => [i.id, i]));
  for (const bid of blockers) {
    const blocker = itemsById.get(bid);
    if (!blocker) continue; // missing blocker = not blocked
    // A blocker is "done" if it has a checklist and all items are checked
    if (blocker.checklist && blocker.checklist.length > 0) {
      if (!blocker.checklist.every((cl) => cl.done)) return false;
    } else {
      // No checklist = we can't tell if it's done, treat as blocking
      return false;
    }
  }
  return true;
}

/** Get the maximum wave number (excluding Infinity). */
export function maxWave(waves: Map<string, number>): number {
  let max = 0;
  for (const w of waves.values()) {
    if (w !== Infinity && w > max) max = w;
  }
  return max;
}
