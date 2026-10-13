import type { LintIssue } from "../types.js";

/**
 * Flag any id repeated within `items` — something no JSON Schema in this
 * repo enforces (schema validation is per-document, not "unique across
 * this array"), and a real authoring mistake wherever it happens: two
 * modules/lessons/options/pool candidates/etc. sharing one id makes that
 * id ambiguous to anything addressing by it.
 */
export function checkUniqueIds(items: { id: string }[], at: string, issues: LintIssue[]): void {
  const firstSeenAt = new Map<string, number>();
  items.forEach((item, i) => {
    const firstIndex = firstSeenAt.get(item.id);
    if (firstIndex !== undefined) {
      issues.push({
        rule: "duplicate-id",
        severity: "error",
        at: `${at}[${i}]`,
        message: `Duplicate id "${item.id}" (first seen at ${at}[${firstIndex}])`,
      });
    } else {
      firstSeenAt.set(item.id, i);
    }
  });
}
