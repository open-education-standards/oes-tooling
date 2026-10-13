import { isOpfGroupEntry, isOpfPoolEntry } from "@inklyre/oes-core";
import type {
  OpfSet,
  ResolvedCourse,
  ResolvedLesson,
  ResolvedModule,
  ResolvedQuestion,
  ResolveError,
} from "@inklyre/oes-core";
import type { LintIssue } from "./types.js";
import { lintQuestion } from "./question.js";
import { checkPoolBounds } from "./rules/pool-bounds.js";
import { checkGroupStimulusAgreement, checkGroupStructure } from "./rules/group-structure.js";
import { checkUniqueIds } from "./rules/unique-ids.js";

/** `resolveCourse`/`resolveSet`'s own errors (dangling references, `content_hash` mismatches) — already-detected issues, just relabeled into this package's shape. */
export function resolveErrorsToIssues(errors: ResolveError[]): LintIssue[] {
  return errors.map(
    (error): LintIssue => ({
      rule: error.message.includes("content_hash mismatch") ? "content-hash-mismatch" : "dangling-reference",
      severity: "error",
      at: error.at,
      message: error.message,
    })
  );
}

export async function lintSetContent(set: OpfSet, questions: ResolvedQuestion[], at: string, issues: LintIssue[]): Promise<void> {
  checkUniqueIds(set.questions, `${at}.questions`, issues);

  // Ids must be unique across the whole set, not just among siblings — a
  // part buried in a group is still addressed by id like any other entry.
  const allEntries = set.questions.flatMap(function expand(entry): { id: string }[] {
    return isOpfGroupEntry(entry) ? [entry, ...entry.parts.flatMap(expand)] : [entry];
  });
  if (allEntries.length > set.questions.length) {
    checkUniqueIds(allEntries, `${at}.questions (including group parts)`, issues);
  }

  const stimulusOf = (id: string): string | undefined => {
    const resolved = questions.find((q) => q.id === id);
    const stimulus = resolved?.question.stimulus;
    return stimulus && (stimulus.path ?? stimulus.stimulus_url);
  };

  set.questions.forEach((entry, i) => {
    const entryAt = `${at}.questions[${i}]`;
    if (isOpfPoolEntry(entry)) checkPoolBounds(entry, entryAt, issues);
    if (isOpfGroupEntry(entry)) {
      checkGroupStructure(entry, entryAt, issues);
      checkGroupStimulusAgreement(entry, stimulusOf, entryAt, issues);
    }
  });
  for (const question of questions) {
    await lintQuestion(question, `${at}.questions[id=${question.id}]`, issues);
  }
}

export async function lintResolvedLesson(lesson: ResolvedLesson, at: string, issues: LintIssue[]): Promise<void> {
  checkUniqueIds(lesson.lesson.items ?? [], `${at}.items`, issues);
  for (const [i, item] of lesson.items.entries()) {
    if (item.type === "practice_set") {
      await lintSetContent(item.set, item.questions, `${at}.items[${i}]`, issues);
    }
  }
}

export async function lintResolvedModule(module_: ResolvedModule, at: string, issues: LintIssue[]): Promise<void> {
  checkUniqueIds(module_.module.lessons, `${at}.lessons`, issues);
  for (const [i, lesson] of module_.lessons.entries()) {
    await lintResolvedLesson(lesson, `${at}.lessons[${i}]`, issues);
  }
}

export async function lintResolvedCourse(course: ResolvedCourse, issues: LintIssue[]): Promise<void> {
  checkUniqueIds(course.course.modules, "course.modules", issues);
  for (const [i, module_] of course.modules.entries()) {
    await lintResolvedModule(module_, `course.modules[${i}]`, issues);
  }
}
