import type { ContentSource } from "./content-source.js";
import { contentHashMatches } from "./hash.js";
import type {
  OcfArticleRef,
  OcfCourse,
  OcfLesson,
  OcfLessonItem,
  OcfModule,
  OcfPracticeSetRef,
  OcfResourceRef,
  OcfVideoLessonRef,
} from "./types/ocf.js";
import type { OafArticle } from "./types/oaf.js";
import type { OpfPoolCandidate, OpfQuestionEntry, OpfSet } from "./types/opf.js";
import { isOpfGroupEntry, isOpfPoolEntry } from "./types/opf.js";
import type { OqfQuestion, OqfStimulus } from "./types/oqf.js";
import type { Prose } from "./types/common.js";
import { isProseFile } from "./types/common.js";
import type { OrfResource } from "./types/orf.js";
import type { OvfVideo } from "./types/ovf.js";
import {
  validateOafArticle,
  validateOcfCourse,
  validateOcfLesson,
  validateOcfModule,
  validateOpfSet,
  validateOqfQuestion,
  validateOqfStimulus,
  validateOrfResource,
  validateOvfVideo,
} from "./validate.js";

/**
 * One reference that couldn't be resolved — a `path` that doesn't exist, a
 * fetch that failed, or a document that failed schema validation. Resolution
 * of everything else continues; per the Versioning & Conformance page's
 * error-handling contract, one broken reference never fails the whole tree.
 */
export interface ResolveError {
  /** Where in the tree this happened, e.g. `"modules[0].lessons[1].articles[0]"`. */
  at: string;
  message: string;
  cause?: unknown;
}

export interface ResolveResult<T> {
  data: T;
  errors: ResolveError[];
}

/** An article with its prose inlined — `content` is always a string here. */
export interface ResolvedArticle {
  ref: OcfArticleRef;
  article: OafArticle;
}

export interface ResolvedVideoLesson {
  ref: OcfVideoLessonRef;
  video: OvfVideo;
}

export interface ResolvedResource {
  ref: OcfResourceRef;
  resource: OrfResource;
}

export interface ResolvedQuestion {
  /** The entry's own `id` within the set (a direct entry's id, or a pool candidate's id). */
  id: string;
  /**
   * The question, with prose inlined: `statement` is **always a string**
   * here, never a `{file}` reference, and the same holds for any
   * stimulus `content`. Resolving a reference the caller would otherwise
   * have to fetch itself is the whole job — leaving prose unresolved
   * made every consumer re-implement it.
   */
  question: OqfQuestion;
  stimulus?: OqfStimulus;
  /**
   * A {@link ContentSource} rooted at this question's own directory —
   * deliberately exposed so a caller (e.g. `@inklyre/oes-lint` checking
   * `answer_key.file` exists) can fetch something relative to the question
   * itself. `resolve()` never fetches `answer_key` content: a public,
   * student-facing consumer built on `resolveCourse`/`resolveSet` must
   * never gain a path to the answer through the shared resolver.
   */
  source: ContentSource;
}

export interface ResolvedPracticeSet {
  ref: OcfPracticeSetRef;
  set: OpfSet;
  /** Every question reachable from this set — direct entries and every pool candidate. */
  questions: ResolvedQuestion[];
}

/**
 * One resolved entry in a lesson's ordered `items[]` — narrowing on
 * `type` also narrows the rest to that type's own resolved shape, same
 * as {@link OcfLessonItem} does for the unresolved reference.
 */
export type ResolvedLessonItem =
  | ({ type: "article" } & ResolvedArticle)
  | ({ type: "video" } & ResolvedVideoLesson)
  | ({ type: "practice_set" } & ResolvedPracticeSet)
  | ({ type: "resource" } & ResolvedResource);

export interface ResolvedLesson {
  lesson: OcfLesson;
  /** Every item, in the same order as `lesson.items`. */
  items: ResolvedLessonItem[];
}

export interface ResolvedModule {
  module: OcfModule;
  lessons: ResolvedLesson[];
}

export interface ResolvedCourse {
  course: OcfCourse;
  modules: ResolvedModule[];
}

/**
 * Resolve a `{path} | {*_url}` reference's `path`/url pair to a location
 * `ContentSource.fetch` can read: `path` is a folder unless it already ends
 * in `.json` (OPF's single-file question convention), in which case
 * `fileName` is appended; a URL is used exactly as given.
 */
function refLocation(path: string | undefined, url: string | undefined, fileName: string): string {
  if (path !== undefined) return path.endsWith(".json") ? path : `${path}/${fileName}`;
  if (url !== undefined) return url;
  throw new Error(`Reference has neither "path" nor a URL field`);
}

/**
 * Verify a fetched document's raw bytes against a reference's declared
 * `content_hash`, recording a mismatch the same way a dangling reference
 * is recorded — per the error-handling contract, this never throws or
 * aborts resolution, it only annotates `errors`.
 */
/**
 * Replace a `{file}` prose reference with the file's text.
 *
 * Uses {@link ContentSource.fetchText} rather than `fetch`, since prose is
 * Markdown and `fetch` parses as JSON unconditionally. A `content_hash` on
 * the reference is verified here — that is the only place a separate prose
 * file's bytes can be checked at all.
 */
async function inlineProse(
  prose: Prose | undefined,
  source: ContentSource,
  at: string,
  errors: ResolveError[]
): Promise<Prose | undefined> {
  if (prose === undefined || !isProseFile(prose)) return prose;
  try {
    const text = await source.fetchText(prose.file);
    await checkContentHash(text, prose.content_hash, at, errors);
    return text;
  } catch (cause) {
    errors.push({ at, message: `Failed to read prose file "${prose.file}"`, cause });
    return prose;
  }
}

async function checkContentHash(
  raw: string,
  contentHash: string | undefined,
  at: string,
  errors: ResolveError[]
): Promise<void> {
  if (contentHash === undefined) return;
  const matches = await contentHashMatches(raw, contentHash);
  if (matches === false) {
    errors.push({ at, message: `content_hash mismatch: declared "${contentHash}" does not match the fetched content` });
  }
}

async function resolveArticle(
  source: ContentSource,
  ref: OcfArticleRef,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedArticle | undefined> {
  try {
    const { data, raw, source: articleSource } = await source.fetch(refLocation(ref.path, ref.article_url, "article.json"));
    await checkContentHash(raw, ref.content_hash, at, errors);
    const result = validateOafArticle(data);
    if (!result.valid) {
      errors.push({ at, message: "article.json failed schema validation", cause: result.errors });
      return undefined;
    }
    const article = {
      ...result.data!,
      content: (await inlineProse(result.data!.content, articleSource, `${at}.content`, errors)) as OafArticle["content"],
    };
    return { ref, article };
  } catch (cause) {
    errors.push({ at, message: `Failed to resolve article "${ref.id}"`, cause });
    return undefined;
  }
}

async function resolveVideoLesson(
  source: ContentSource,
  ref: OcfVideoLessonRef,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedVideoLesson | undefined> {
  try {
    const { data, raw } = await source.fetch(refLocation(ref.path, ref.video_lesson_url, "video.json"));
    await checkContentHash(raw, ref.content_hash, at, errors);
    const result = validateOvfVideo(data);
    if (!result.valid) {
      errors.push({ at, message: "video.json failed schema validation", cause: result.errors });
      return undefined;
    }
    return { ref, video: result.data! };
  } catch (cause) {
    errors.push({ at, message: `Failed to resolve video lesson "${ref.id}"`, cause });
    return undefined;
  }
}

async function resolveResource(
  source: ContentSource,
  ref: OcfResourceRef,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedResource | undefined> {
  try {
    const { data, raw } = await source.fetch(refLocation(ref.path, ref.resource_url, "resource.json"));
    await checkContentHash(raw, ref.content_hash, at, errors);
    const result = validateOrfResource(data);
    if (!result.valid) {
      errors.push({ at, message: "resource.json failed schema validation", cause: result.errors });
      return undefined;
    }
    return { ref, resource: result.data! };
  } catch (cause) {
    errors.push({ at, message: `Failed to resolve resource "${ref.id}"`, cause });
    return undefined;
  }
}

async function resolveQuestionAt(
  source: ContentSource,
  location: string,
  id: string,
  contentHash: string | undefined,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedQuestion | undefined> {
  try {
    const { data, raw, source: questionSource } = await source.fetch(location);
    await checkContentHash(raw, contentHash, at, errors);
    const result = validateOqfQuestion(data);
    if (!result.valid) {
      errors.push({ at, message: "question.json failed schema validation", cause: result.errors });
      return undefined;
    }
    const question = {
      ...result.data!,
      statement: (await inlineProse(result.data!.statement, questionSource, `${at}.statement`, errors)) as OqfQuestion["statement"],
    } as OqfQuestion;
    let stimulus: OqfStimulus | undefined;
    if (question.stimulus) {
      const stimulusLocation = refLocation(question.stimulus.path, question.stimulus.stimulus_url, "stimulus.json");
      try {
        const fetched = await questionSource.fetch(stimulusLocation);
        await checkContentHash(fetched.raw, question.stimulus.content_hash, `${at}.stimulus`, errors);
        const stimulusResult = validateOqfStimulus(fetched.data);
        if (stimulusResult.valid) {
          stimulus = {
            ...stimulusResult.data!,
            content: await inlineProse(stimulusResult.data!.content, fetched.source, `${at}.stimulus.content`, errors),
          };
        } else {
          errors.push({ at: `${at}.stimulus`, message: "stimulus.json failed schema validation", cause: stimulusResult.errors });
        }
      } catch (cause) {
        errors.push({ at: `${at}.stimulus`, message: "Failed to resolve stimulus", cause });
      }
    }
    return { id, question, stimulus, source: questionSource };
  } catch (cause) {
    errors.push({ at, message: `Failed to resolve question "${id}"`, cause });
    return undefined;
  }
}

async function resolveSetAt(
  source: ContentSource,
  location: string,
  contentHash: string | undefined,
  at: string,
  errors: ResolveError[]
): Promise<Omit<ResolvedPracticeSet, "ref"> | undefined> {
  let fetched;
  try {
    fetched = await source.fetch(location);
  } catch (cause) {
    errors.push({ at, message: "Failed to resolve practice set", cause });
    return undefined;
  }
  await checkContentHash(fetched.raw, contentHash, at, errors);
  const result = validateOpfSet(fetched.data);
  if (!result.valid) {
    errors.push({ at, message: "set.json failed schema validation", cause: result.errors });
    return undefined;
  }
  const set = result.data!;
  const setSource = fetched.source;

  const questions: ResolvedQuestion[] = [];

  // Every question reachable from the set, in document order: a group's
  // parts are resolved in place, so a consumer that ignores grouping still
  // sees each part exactly once and in the right order.
  const resolveEntries = async (entries: OpfQuestionEntry[], prefix: string): Promise<void> => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const entryAt = `${prefix}[${i}]`;
      if (isOpfGroupEntry(entry)) {
        await resolveEntries(entry.parts, `${entryAt}.parts`);
      } else if (isOpfPoolEntry(entry)) {
        for (let j = 0; j < entry.from.length; j++) {
          const candidate: OpfPoolCandidate = entry.from[j]!;
          const location = refLocation(candidate.path, candidate.question_url, "question.json");
          const resolved = await resolveQuestionAt(setSource, location, candidate.id, candidate.content_hash, `${entryAt}.from[${j}]`, errors);
          if (resolved) questions.push(resolved);
        }
      } else {
        const location = refLocation(entry.path, entry.question_url, "question.json");
        const resolved = await resolveQuestionAt(setSource, location, entry.id, entry.content_hash, entryAt, errors);
        if (resolved) questions.push(resolved);
      }
    }
  };
  await resolveEntries(set.questions, `${at}.questions`);

  return { set, questions };
}

async function resolvePracticeSet(
  source: ContentSource,
  ref: OcfPracticeSetRef,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedPracticeSet | undefined> {
  const resolved = await resolveSetAt(source, refLocation(ref.path, ref.set_url, "set.json"), ref.content_hash, at, errors);
  return resolved && { ref, ...resolved };
}

async function resolveLessonAt(
  source: ContentSource,
  location: string,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedLesson | undefined> {
  let fetched;
  try {
    fetched = await source.fetch(location);
  } catch (cause) {
    errors.push({ at, message: "Failed to resolve lesson", cause });
    return undefined;
  }
  const result = validateOcfLesson(fetched.data);
  if (!result.valid) {
    errors.push({ at, message: "lesson.json failed schema validation", cause: result.errors });
    return undefined;
  }
  const lesson = result.data!;
  const lessonSource = fetched.source;

  const items: ResolvedLessonItem[] = [];
  const lessonItems: OcfLessonItem[] = lesson.items ?? [];
  for (let i = 0; i < lessonItems.length; i++) {
    const item = lessonItems[i]!;
    const itemAt = `${at}.items[${i}]`;
    switch (item.type) {
      case "article": {
        const resolved = await resolveArticle(lessonSource, item, itemAt, errors);
        if (resolved) items.push({ type: "article", ...resolved });
        break;
      }
      case "video": {
        const resolved = await resolveVideoLesson(lessonSource, item, itemAt, errors);
        if (resolved) items.push({ type: "video", ...resolved });
        break;
      }
      case "practice_set": {
        const resolved = await resolvePracticeSet(lessonSource, item, itemAt, errors);
        if (resolved) items.push({ type: "practice_set", ...resolved });
        break;
      }
      case "resource": {
        const resolved = await resolveResource(lessonSource, item, itemAt, errors);
        if (resolved) items.push({ type: "resource", ...resolved });
        break;
      }
    }
  }

  return { lesson, items };
}

async function resolveModuleAt(
  source: ContentSource,
  location: string,
  at: string,
  errors: ResolveError[]
): Promise<ResolvedModule | undefined> {
  let fetched;
  try {
    fetched = await source.fetch(location);
  } catch (cause) {
    errors.push({ at, message: "Failed to resolve module", cause });
    return undefined;
  }
  const result = validateOcfModule(fetched.data);
  if (!result.valid) {
    errors.push({ at, message: "module.json failed schema validation", cause: result.errors });
    return undefined;
  }
  const module_ = result.data!;
  const moduleSource = fetched.source;

  const lessons: ResolvedLesson[] = [];
  for (let i = 0; i < module_.lessons.length; i++) {
    const ref = module_.lessons[i]!;
    const resolved = await resolveLessonAt(moduleSource, `${ref.path}/lesson.json`, `${at}.lessons[${i}]`, errors);
    if (resolved) lessons.push(resolved);
  }

  return { module: module_, lessons };
}

/**
 * Resolve a full course tree — course → modules → lessons →
 * articles/video lessons/practice sets → questions (→ stimuli) — from a
 * single entry point, following every `path`/`*_url` reference and
 * validating every document it fetches along the way.
 *
 * One broken reference never aborts the whole resolution: it's recorded in
 * `errors` and everything else still resolves, per the Versioning &
 * Conformance page's error-handling contract.
 */
export async function resolveCourse(
  source: ContentSource,
  location = "course.json"
): Promise<ResolveResult<ResolvedCourse | undefined>> {
  const errors: ResolveError[] = [];
  let fetched;
  try {
    fetched = await source.fetch(location);
  } catch (cause) {
    errors.push({ at: "course", message: "Failed to resolve course", cause });
    return { data: undefined, errors };
  }
  const result = validateOcfCourse(fetched.data);
  if (!result.valid) {
    errors.push({ at: "course", message: "course.json failed schema validation", cause: result.errors });
    return { data: undefined, errors };
  }
  const course = result.data!;
  const courseSource = fetched.source;

  const modules: ResolvedModule[] = [];
  for (let i = 0; i < course.modules.length; i++) {
    const ref = course.modules[i]!;
    const resolved = await resolveModuleAt(courseSource, `${ref.path}/module.json`, `modules[${i}]`, errors);
    if (resolved) modules.push(resolved);
  }

  return { data: { course, modules }, errors };
}

/** Resolve a single OPF set — an entry point for practice content outside a course, e.g. from a set-only repo. */
export async function resolveSet(
  source: ContentSource,
  location = "set.json"
): Promise<ResolveResult<Omit<ResolvedPracticeSet, "ref"> | undefined>> {
  const errors: ResolveError[] = [];
  const resolved = await resolveSetAt(source, location, undefined, "set", errors);
  return { data: resolved, errors };
}

/** Resolve a single lesson — an entry point for previewing one lesson in isolation (e.g. an authoring tool). */
export async function resolveLesson(
  source: ContentSource,
  location = "lesson.json"
): Promise<ResolveResult<ResolvedLesson | undefined>> {
  const errors: ResolveError[] = [];
  const data = await resolveLessonAt(source, location, "lesson", errors);
  return { data, errors };
}

/** Resolve a single module — an entry point for previewing one module in isolation. */
export async function resolveModule(
  source: ContentSource,
  location = "module.json"
): Promise<ResolveResult<ResolvedModule | undefined>> {
  const errors: ResolveError[] = [];
  const data = await resolveModuleAt(source, location, "module", errors);
  return { data, errors };
}
