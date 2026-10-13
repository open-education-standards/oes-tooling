import type { ResolvedQuestion } from "@inklyre/oes-core";
import type { LintIssue } from "../types.js";

/**
 * When `answer_key.file` is set, confirm the file actually exists —
 * independent of whether `resolve()` ever fetches it, since it
 * deliberately doesn't (a public/student-facing consumer built on
 * `resolveCourse`/`resolveSet` must never gain a path to the answer
 * through the shared resolver). Uses the question's own re-rooted
 * `source`, exposed on {@link ResolvedQuestion} for exactly this purpose.
 *
 * Checks existence with `fetchText`, not `fetch`. `fetch` parses JSON
 * unconditionally, so a perfectly valid non-JSON answer key — a `.md` or
 * `.txt` rubric, say — used to be reported as missing. The rule's job is
 * to confirm the file is there, not to dictate its format.
 */
export async function checkAnswerKeyFile(resolved: ResolvedQuestion, at: string, issues: LintIssue[]): Promise<void> {
  const file = resolved.question.answer_key?.file;
  if (file === undefined) return;
  try {
    await resolved.source.fetchText(file);
  } catch (cause) {
    issues.push({
      rule: "answer-key-file-missing",
      severity: "error",
      at: `${at}.answer_key`,
      message: `answer_key.file "${file}" could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }
}
