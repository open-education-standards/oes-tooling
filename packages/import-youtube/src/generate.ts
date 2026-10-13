import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OcfLesson, OcfModule, OvfVideo, ValidationResult } from "@inklyre/oes-core";
import { validateOcfLesson, validateOcfModule, validateOvfVideo } from "@inklyre/oes-core";
import type { ImportPlan, ImportPlanLesson } from "./plan.js";

export interface GenerateOptions {
  /**
   * Write into `outDir` even if it already exists and wasn't itself
   * produced by a previous run of this importer. Without this, generation
   * refuses to touch a directory it doesn't recognize, so `--out` pointed
   * at the wrong folder by mistake can't silently destroy something else.
   */
  force?: boolean;
}

export interface GenerateResult {
  outDir: string;
  moduleId: string;
  lessonCount: number;
  /** Every file written, relative to `outDir`. */
  files: string[];
}

function assertValid<T>(label: string, result: ValidationResult<T>): void {
  if (!result.valid) {
    throw new Error(
      `Generated ${label} failed schema validation — this indicates a bug in the importer, not the source playlist:\n` +
        JSON.stringify(result.errors, null, 2),
    );
  }
}

async function assertSafeToWrite(outDir: string, force: boolean): Promise<void> {
  if (force) return;
  let existing: string;
  try {
    existing = await readFile(join(outDir, "module.json"), "utf8");
  } catch {
    return; // Nothing at outDir/module.json yet — safe either way.
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    parsed = undefined;
  }
  const platform = (parsed as { source?: { platform?: string } } | undefined)?.source?.platform;
  if (platform !== "YouTube") {
    throw new Error(
      `${outDir} already contains a module.json not produced by this importer (source.platform is ` +
        `${JSON.stringify(platform)}, not "YouTube"). Refusing to overwrite it — pass force: true / --force ` +
        `if this is intentional, or choose a different output directory.`,
    );
  }
}

async function writeJson(path: string, doc: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

function moduleSource(plan: ImportPlan): OcfModule["source"] {
  return { url: plan.source.playlist_url, platform: "YouTube", retrieved_at: plan.source.retrieved_at };
}

function videoSource(plan: ImportPlan, lesson: ImportPlanLesson): OvfVideo["source"] {
  return {
    url: `https://www.youtube.com/watch?v=${lesson.video.youtube_video_id}`,
    platform: "YouTube",
    retrieved_at: plan.source.retrieved_at,
  };
}

function buildModule(plan: ImportPlan): OcfModule {
  return {
    ocf_version: "0.3.0",
    id: plan.module.id,
    title: plan.module.title,
    lessons: plan.module.lessons.map((lesson) => ({
      id: lesson.id,
      // module.lessons[].path is the lesson's *folder*, not lesson.json
      // itself — @inklyre/oes-core's resolver appends "/lesson.json" unconditionally
      // here (unlike lesson.items[]'s path, which may be a direct file path).
      path: `lessons/${lesson.id}`,
    })),
    source: moduleSource(plan),
  };
}

function buildVideo(plan: ImportPlan, lesson: ImportPlanLesson): OvfVideo {
  return {
    ovf_version: "0.1.0",
    id: lesson.video.id,
    title: lesson.video.title,
    description: lesson.video.description,
    video_url: `https://www.youtube.com/watch?v=${lesson.video.youtube_video_id}`,
    duration_mins: lesson.video.duration_mins,
    chapters: lesson.video.chapters,
    source: videoSource(plan, lesson),
  };
}

function buildLesson(plan: ImportPlan, lesson: ImportPlanLesson): OcfLesson {
  return {
    ocf_version: "0.3.0",
    id: lesson.id,
    title: lesson.title,
    items: [
      {
        type: "video",
        id: lesson.video.id,
        title: lesson.video.title,
        path: `video-lessons/${lesson.video.id}/video.json`,
        required: true,
      },
    ],
    source: moduleSource(plan),
  };
}

/**
 * Write an {@link ImportPlan} to disk as a real OES tree: one
 * `module.json`, one `lessons/{id}/lesson.json` per planned lesson, and
 * one co-located `video-lessons/{id}/video.json` under each lesson,
 * matching OCF's standard file-structure convention exactly. Every
 * document is schema-validated before anything is written — a validation
 * failure aborts with nothing written, rather than leaving a partially
 * generated tree on disk.
 *
 * `outDir`'s `lessons/` subtree is fully replaced on every call — this is
 * a full-regenerate, not an incremental merge. Treat this directory's
 * contents as generated output, not something to hand-edit: a video
 * removed from the source playlist since the last run will have its
 * lesson folder deleted here, and any manual edits to a previously
 * generated lesson/video.json will be overwritten.
 */
export async function generateFromPlan(
  plan: ImportPlan,
  outDir: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  await assertSafeToWrite(outDir, options.force ?? false);

  const moduleDoc = buildModule(plan);
  assertValid("module.json", validateOcfModule(moduleDoc));

  const built = plan.module.lessons.map((lesson) => ({
    lesson,
    lessonDoc: buildLesson(plan, lesson),
    videoDoc: buildVideo(plan, lesson),
  }));
  for (const { lesson, lessonDoc, videoDoc } of built) {
    assertValid(`lessons/${lesson.id}/lesson.json`, validateOcfLesson(lessonDoc));
    assertValid(`lessons/${lesson.id}/video-lessons/${lesson.video.id}/video.json`, validateOvfVideo(videoDoc));
  }

  await rm(join(outDir, "lessons"), { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const files: string[] = [];
  await writeJson(join(outDir, "module.json"), moduleDoc);
  files.push("module.json");

  for (const { lesson, lessonDoc, videoDoc } of built) {
    const lessonDir = join(outDir, "lessons", lesson.id);
    const videoDir = join(lessonDir, "video-lessons", lesson.video.id);
    await mkdir(videoDir, { recursive: true });
    await writeJson(join(lessonDir, "lesson.json"), lessonDoc);
    await writeJson(join(videoDir, "video.json"), videoDoc);
    files.push(`lessons/${lesson.id}/lesson.json`, `lessons/${lesson.id}/video-lessons/${lesson.video.id}/video.json`);
  }

  return { outDir, moduleId: plan.module.id, lessonCount: plan.module.lessons.length, files };
}
