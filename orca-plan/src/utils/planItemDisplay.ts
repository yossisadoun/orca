import type { PlanItemGroup, PlanTrackItem } from "../types";

/** Merge consecutive items (in list order) that share the same resolved group into one visual block. */
export function buildPlanItemDisplayBlocks(
  trackItems: PlanTrackItem[],
  groups: PlanItemGroup[],
): { group: PlanItemGroup | null; items: PlanTrackItem[] }[] {
  const map = new Map(groups.map((g) => [g.id, g]));
  const blocks: { group: PlanItemGroup | null; items: PlanTrackItem[] }[] = [];

  for (const item of trackItems) {
    const gid = item.itemGroupId;
    const resolved = gid && map.has(gid) ? map.get(gid)! : null;
    const blockKey = resolved ? resolved.id : "__ungrouped__";

    const last = blocks[blocks.length - 1];
    const lastKey =
      last && last.items[0]
        ? last.group
          ? last.group.id
          : "__ungrouped__"
        : null;

    if (last && lastKey === blockKey) {
      last.items.push(item);
    } else {
      blocks.push({ group: resolved, items: [item] });
    }
  }
  return blocks;
}

/** Remove item groups not referenced by any plan item. */
export function pruneOrphanPlanItemGroups(
  items: PlanTrackItem[],
  groups: PlanItemGroup[],
): PlanItemGroup[] {
  const used = new Set(items.map((i) => i.itemGroupId).filter(Boolean) as string[]);
  return groups.filter((g) => used.has(g.id));
}
