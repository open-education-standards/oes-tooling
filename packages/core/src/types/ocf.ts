import type { RelatedItem, Source, Status } from "./common.js";
import type { ExactlyOne } from "./util.js";

export interface OcfModuleRef {
  id: string;
  path: string;
}

export interface OcfLessonRef {
  id: string;
  path: string;
}

export type OcfPrerequisite = {
  id: string;
  course_url: string;
  content_hash?: string;
};

/** `course.json` — the top of the hierarchy: course → module → lesson → item (OCF v0.3.0). */
export interface OcfCourse {
  ocf_version: string;
  id: string;
  title: string;
  description?: string;
  authors?: string[];
  license?: string;
  status?: Status;
  tags?: string[];
  language?: string;
  level?: "beginner" | "intermediate" | "advanced";
  estimated_mins?: number;
  outcomes?: string[];
  modules: OcfModuleRef[];
  prerequisites?: OcfPrerequisite[];
  source?: Source;
}

/** `module.json` — a course's second level; sequences lessons. */
export interface OcfModule {
  ocf_version: string;
  id: string;
  title: string;
  description?: string;
  estimated_mins?: number;
  outcomes?: string[];
  lessons: OcfLessonRef[];
  source?: Source;
}

interface OcfContentRefBase {
  id: string;
  title?: string;
  content_hash?: string;
  required?: boolean;
}

export type OcfArticleRef = OcfContentRefBase & ExactlyOne<{ path: string; article_url: string }>;
export type OcfVideoLessonRef = OcfContentRefBase & ExactlyOne<{ path: string; video_lesson_url: string }>;
export type OcfPracticeSetRef = OcfContentRefBase & ExactlyOne<{ path: string; set_url: string }>;
export type OcfResourceRef = OcfContentRefBase & ExactlyOne<{ path: string; resource_url: string }>;

/**
 * One entry in a lesson's ordered `items[]` — the actual sequence a
 * learner goes through. Narrowing on `type` also narrows the rest of the
 * entry to that type's own reference shape (`path`, or the type-specific
 * `*_url` field).
 */
export type OcfLessonItem =
  | ({ type: "article" } & OcfArticleRef)
  | ({ type: "video" } & OcfVideoLessonRef)
  | ({ type: "practice_set" } & OcfPracticeSetRef)
  | ({ type: "resource" } & OcfResourceRef);

/**
 * `lesson.json` — a lesson owns no prose of its own; its content is the
 * ordered sequence of items (articles/video lessons/practice sets) it
 * references.
 */
export interface OcfLesson {
  ocf_version: string;
  id: string;
  title: string;
  description?: string;
  estimated_mins?: number;
  items?: OcfLessonItem[];
  /** Suggested material beyond this lesson's own content — never the lesson's own material. */
  related?: RelatedItem[];
  source?: Source;
}
