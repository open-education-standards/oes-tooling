import type { ContentSource } from "@inklyre/oes-core";
import { resolveCourse, resolveLesson, resolveModule, resolveSet } from "@inklyre/oes-core";
import type { LintIssue, LintResult } from "./types.js";
import { lintResult } from "./types.js";
import { lintResolvedCourse, lintResolvedLesson, lintResolvedModule, lintSetContent, resolveErrorsToIssues } from "./tree.js";

export type { LintIssue, LintResult, LintRule, LintSeverity } from "./types.js";

/**
 * Lint a full course tree from a `course.json` entry point: every check
 * `resolve()` already makes (dangling references, `content_hash`
 * mismatches) plus everything only a whole-tree view can catch —
 * duplicate ids, pool `select` bounds, dangling answer cross-references,
 * `answer_key` file existence.
 */
export async function lintCourse(source: ContentSource, location = "course.json"): Promise<LintResult> {
  const { data, errors } = await resolveCourse(source, location);
  const issues: LintIssue[] = resolveErrorsToIssues(errors);
  if (data) await lintResolvedCourse(data, issues);
  return lintResult(issues);
}

/** Lint a single practice set from a `set.json` entry point — for a set-only repo, outside any course. */
export async function lintSet(source: ContentSource, location = "set.json"): Promise<LintResult> {
  const { data, errors } = await resolveSet(source, location);
  const issues: LintIssue[] = resolveErrorsToIssues(errors);
  if (data) await lintSetContent(data.set, data.questions, "set", issues);
  return lintResult(issues);
}

/** Lint a single lesson from a `lesson.json` entry point — for previewing/authoring one lesson in isolation. */
export async function lintLesson(source: ContentSource, location = "lesson.json"): Promise<LintResult> {
  const { data, errors } = await resolveLesson(source, location);
  const issues: LintIssue[] = resolveErrorsToIssues(errors);
  if (data) await lintResolvedLesson(data, "lesson", issues);
  return lintResult(issues);
}

/** Lint a single module from a `module.json` entry point — for previewing/authoring one module in isolation. */
export async function lintModule(source: ContentSource, location = "module.json"): Promise<LintResult> {
  const { data, errors } = await resolveModule(source, location);
  const issues: LintIssue[] = resolveErrorsToIssues(errors);
  if (data) await lintResolvedModule(data, "module", issues);
  return lintResult(issues);
}
