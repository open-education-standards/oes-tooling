import { isOpfGroupEntry, isOpfPoolEntry, type OpfGroupQuestionEntry, type OpfQuestionEntry } from "@inklyre/oes-core";
import type { LintIssue } from "../types.js";

/**
 * Past papers reach two levels of nesting — Q3(a)(i) — routinely, and a
 * third almost never for a good reason. Warning rather than erroring
 * keeps a genuinely unusual paper representable.
 */
const MAX_DEPTH = 2;

/**
 * Checks on a multi-part group that the schema can't make itself: they are
 * either relationships between sibling fields, or judgements about what is
 * suspicious-but-legal.
 */
export function checkGroupStructure(
  entry: OpfGroupQuestionEntry,
  at: string,
  issues: LintIssue[],
  depth = 1,
): void {
  if (entry.answer_any !== undefined && entry.answer_any > entry.parts.length) {
    issues.push({
      rule: "group-answer-any-bounds",
      severity: "error",
      at,
      message: `answer_any (${entry.answer_any}) exceeds the number of parts (${entry.parts.length})`,
    });
  }

  if (entry.parts.length === 1) {
    issues.push({
      rule: "group-single-part",
      severity: "warning",
      at,
      message:
        "a group with one part adds a heading but no grouping — a direct entry with a title says the same thing more simply",
    });
  }

  if (depth > MAX_DEPTH) {
    issues.push({
      rule: "group-nesting-depth",
      severity: "warning",
      at,
      message: `nested ${depth} levels deep; past two levels (Q3(a)(i)) a paper is usually easier to read as separate questions`,
    });
  }

  for (let i = 0; i < entry.parts.length; i++) {
    const part = entry.parts[i]!;
    if (isOpfGroupEntry(part)) {
      checkGroupStructure(part, `${at}.parts[${i}]`, issues, depth + 1);
    }
  }
}

/** Every direct (non-pool, non-group) entry reachable from a list. */
function directEntries(entries: OpfQuestionEntry[]): OpfQuestionEntry[] {
  return entries.flatMap((entry) =>
    isOpfGroupEntry(entry) ? directEntries(entry.parts) : isOpfPoolEntry(entry) ? [] : [entry],
  );
}

/**
 * Warn when a group's parts don't all point at the same stimulus.
 *
 * A multi-part question almost always shares one stem, and the stem lives
 * on each part's own question rather than on the group. That makes a
 * mismatch invisible in `set.json` and easy to introduce by copying a
 * part — so it's worth surfacing, while staying a warning because a paper
 * may legitimately group parts that share only a topic.
 */
export function checkGroupStimulusAgreement(
  entry: OpfGroupQuestionEntry,
  stimulusOf: (entryId: string) => string | undefined,
  at: string,
  issues: LintIssue[],
): void {
  const parts = directEntries(entry.parts);
  if (parts.length < 2) return;

  const seen = new Map<string, string[]>();
  for (const part of parts) {
    const key = stimulusOf(part.id) ?? "(none)";
    seen.set(key, [...(seen.get(key) ?? []), part.id]);
  }
  if (seen.size <= 1) return;

  const summary = [...seen.entries()]
    .map(([stimulus, ids]) => `${stimulus} (${ids.join(", ")})`)
    .join("; ")
  issues.push({
    rule: "group-stimulus-mismatch",
    severity: "warning",
    at,
    message: `parts of this group reference different stimuli: ${summary}`,
  });
}
