import type { IssuePlanItem } from "../types";

/** Display labels like `1.` `1.1` `2.` for nested plan rows. */
export function planDisplayNumbers(items: IssuePlanItem[]): string[] {
  let major = 0;
  let sub = 0;
  const out: string[] = [];
  let prevDepth = 0;

  for (const item of items) {
    if (item.depth === 0) {
      major += 1;
      sub = 0;
      out.push(`${major}.`);
      prevDepth = 0;
    } else {
      if (prevDepth === 0) sub = 1;
      else sub += 1;
      out.push(`${major}.${sub}`);
      prevDepth = 1;
    }
  }
  return out;
}
