import type { OpfPoolQuestionEntry } from "@inklyre/oes-core";
import type { LintIssue } from "../types.js";
import { checkUniqueIds } from "./unique-ids.js";

/**
 * `select` must be between 1 and `from.length` — the schema can't enforce
 * this itself, since it's a relationship between two sibling fields
 * (see `OpfPoolQuestionEntry.select`'s own doc comment).
 */
export function checkPoolBounds(entry: OpfPoolQuestionEntry, at: string, issues: LintIssue[]): void {
  if (entry.select < 1) {
    issues.push({
      rule: "pool-select-bounds",
      severity: "error",
      at,
      message: `select (${entry.select}) must be at least 1`,
    });
  } else if (entry.select > entry.from.length) {
    issues.push({
      rule: "pool-select-bounds",
      severity: "error",
      at,
      message: `select (${entry.select}) exceeds from.length (${entry.from.length})`,
    });
  }
  checkUniqueIds(entry.from, `${at}.from`, issues);
}
