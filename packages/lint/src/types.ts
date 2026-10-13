export type LintSeverity = "error" | "warning";

/** Every check this package runs — used as `LintIssue.rule`, and as the rule name printed in CLI output. */
export type LintRule =
  | "dangling-reference"
  | "content-hash-mismatch"
  | "duplicate-id"
  | "pool-select-bounds"
  | "dangling-answer-reference"
  | "answer-key-file-missing"
  | "group-answer-any-bounds"
  | "group-single-part"
  | "group-nesting-depth"
  | "group-stimulus-mismatch";

export interface LintIssue {
  rule: LintRule;
  severity: LintSeverity;
  /** Where in the tree this was found, e.g. `"course.modules[0].lessons[1].items[0].questions[id=q1]"`. */
  at: string;
  message: string;
}

export interface LintResult {
  issues: LintIssue[];
  /** `false` iff at least one `"error"`-severity issue was found — a `"warning"` alone doesn't fail a lint run. */
  ok: boolean;
}

export function lintResult(issues: LintIssue[]): LintResult {
  return { issues, ok: !issues.some((issue) => issue.severity === "error") };
}
