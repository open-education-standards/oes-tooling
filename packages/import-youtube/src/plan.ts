import { deriveId } from "./slug.js";
import type { YoutubePlaylistData, YoutubeVideoData } from "./youtube-api.js";

export interface ImportPlanChapter {
  label: string;
  time_seconds: number;
}

export interface ImportPlanVideo {
  /** OES id — kebab-case, derived from the video's title plus its YouTube video id (stable across re-runs, safe if the raw YouTube id contains characters an OES id can't). */
  id: string;
  youtube_video_id: string;
  title: string;
  description?: string;
  duration_mins?: number;
  thumbnail_url?: string;
  chapters?: ImportPlanChapter[];
}

export interface ImportPlanLesson {
  id: string;
  title: string;
  video: ImportPlanVideo;
}

export interface ImportPlan {
  plan_version: 1;
  source: {
    platform: "YouTube";
    playlist_id: string;
    playlist_url: string;
    playlist_title: string;
    retrieved_at: string;
  };
  module: {
    id: string;
    title: string;
    lessons: ImportPlanLesson[];
  };
}

async function planVideo(video: YoutubeVideoData): Promise<ImportPlanVideo> {
  const id = await deriveId(video.title, video.videoId, "video");
  return {
    id,
    youtube_video_id: video.videoId,
    title: video.title,
    description: video.description || undefined,
    duration_mins: video.durationSeconds !== undefined ? video.durationSeconds / 60 : undefined,
    thumbnail_url: video.thumbnailUrl,
    chapters: video.chapters.length > 0 ? video.chapters : undefined,
  };
}

/**
 * Build an editable import plan from fetched playlist data — one module
 * (the playlist), one lesson per video, each lesson holding exactly that
 * video as its single content item. `id`s are stable (derived from each
 * video's own YouTube id, not array position), so re-running the import
 * against an updated playlist doesn't renumber anything already generated.
 *
 * The plan is plain, serializable data — safe to write to disk, hand-edit
 * (retitle a lesson, reorder `lessons[]`, drop one), and feed back into
 * {@link generateFromPlan} via `--from-plan`, independent of re-fetching
 * YouTube at all.
 */
export async function planYoutubeImport(playlist: YoutubePlaylistData): Promise<ImportPlan> {
  const moduleId = await deriveId(playlist.title, playlist.playlistId, "playlist");
  const lessons: ImportPlanLesson[] = [];
  for (const video of playlist.videos) {
    const planned = await planVideo(video);
    lessons.push({ id: planned.id, title: planned.title, video: planned });
  }

  return {
    plan_version: 1,
    source: {
      platform: "YouTube",
      playlist_id: playlist.playlistId,
      playlist_url: playlist.playlistUrl,
      playlist_title: playlist.title,
      retrieved_at: new Date().toISOString().slice(0, 10),
    },
    module: {
      id: moduleId,
      title: playlist.title,
      lessons,
    },
  };
}

/** Serialize a plan for `--plan <file>` output — stable key order, trailing newline, same convention as every generated OES document. */
export function serializePlan(plan: ImportPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

/**
 * Parse a plan previously written by {@link planYoutubeImport}/
 * {@link serializePlan} (typically hand-edited in between) for
 * `--from-plan <file>`. Only checks `plan_version` and the presence of the
 * fields {@link generateFromPlan} actually reads — not a full schema
 * validation, since a plan is an internal working format, not an OES
 * document type.
 */
export function parsePlan(raw: string): ImportPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error("Plan file is not valid JSON", { cause });
  }
  const plan = parsed as Partial<ImportPlan>;
  if (plan.plan_version !== 1) {
    throw new Error(`Unsupported plan_version ${JSON.stringify(plan.plan_version)} — expected 1.`);
  }
  if (!plan.module || !Array.isArray(plan.module.lessons)) {
    throw new Error("Plan file is missing module.lessons[].");
  }
  return plan as ImportPlan;
}
