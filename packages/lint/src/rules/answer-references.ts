import type { LintIssue } from "../types.js";

/** Flag `id` if it isn't one of `pool`'s ids — e.g. an `mcq`'s `answer` pointing at a nonexistent option. */
export function checkIdExists(id: string, pool: { id: string }[], at: string, issues: LintIssue[]): void {
  if (!pool.some((item) => item.id === id)) {
    issues.push({
      rule: "dangling-answer-reference",
      severity: "error",
      at,
      message: `References id "${id}", which does not exist among [${pool.map((i) => i.id).join(", ")}]`,
    });
  }
}

/** Flag `order` if it isn't exactly a permutation of `items`' ids — every id present once, none missing, none extra. */
export function checkPermutation(order: string[], items: { id: string }[], at: string, issues: LintIssue[]): void {
  const itemIds = items.map((item) => item.id);
  const itemIdSet = new Set(itemIds);
  const orderIdSet = new Set(order);
  const isValid =
    order.length === itemIds.length &&
    orderIdSet.size === order.length &&
    [...orderIdSet].every((id) => itemIdSet.has(id));
  if (!isValid) {
    issues.push({
      rule: "dangling-answer-reference",
      severity: "error",
      at,
      message: `Must be exactly a permutation of [${itemIds.join(", ")}], got [${order.join(", ")}]`,
    });
  }
}
