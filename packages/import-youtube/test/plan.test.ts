import { describe, expect, it } from "vitest";
import { parsePlan, planYoutubeImport, serializePlan } from "../src/plan.js";
import type { YoutubePlaylistData } from "../src/youtube-api.js";

const playlist: YoutubePlaylistData = {
  playlistId: "PLtest",
  playlistUrl: "https://www.youtube.com/playlist?list=PLtest",
  title: "Learn Widgets",
  description: "A course on widgets",
  videos: [
    {
      videoId: "vid1",
      title: "Part 1: Intro",
      description: "d1",
      durationSeconds: 600,
      thumbnailUrl: "https://img.example/1.jpg",
      chapters: [],
    },
    {
      videoId: "vid2",
      title: "Part 2: Advanced",
      description: "d2",
      durationSeconds: undefined,
      thumbnailUrl: undefined,
      chapters: [{ label: "Recap", time_seconds: 0 }, { label: "New material", time_seconds: 30 }],
    },
  ],
};

describe("planYoutubeImport", () => {
  it("builds one module and one lesson per video, in playlist order", async () => {
    const plan = await planYoutubeImport(playlist);
    expect(plan.plan_version).toBe(1);
    expect(plan.source).toMatchObject({ platform: "YouTube", playlist_id: "PLtest" });
    expect(plan.module.title).toBe("Learn Widgets");
    expect(plan.module.lessons).toHaveLength(2);
    expect(plan.module.lessons[0].title).toBe("Part 1: Intro");
    expect(plan.module.lessons[0].video.duration_mins).toBe(10);
    expect(plan.module.lessons[1].video.duration_mins).toBeUndefined();
    expect(plan.module.lessons[1].video.chapters).toHaveLength(2);
  });

  it("gives the module and every lesson/video a valid, stable OES id", async () => {
    const planA = await planYoutubeImport(playlist);
    const planB = await planYoutubeImport(playlist);
    expect(planA.module.id).toBe(planB.module.id);
    expect(planA.module.lessons[0].id).toBe(planB.module.lessons[0].id);
    for (const lesson of planA.module.lessons) {
      expect(lesson.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(lesson.video.id).toBe(lesson.id);
    }
  });

  it("gives different videos different lesson ids", async () => {
    const plan = await planYoutubeImport(playlist);
    expect(plan.module.lessons[0].id).not.toBe(plan.module.lessons[1].id);
  });
});

describe("serializePlan / parsePlan", () => {
  it("round-trips a plan through JSON", async () => {
    const plan = await planYoutubeImport(playlist);
    const parsed = parsePlan(serializePlan(plan));
    expect(parsed).toEqual(plan);
  });

  it("rejects an unsupported plan_version", () => {
    expect(() => parsePlan(JSON.stringify({ plan_version: 2, module: { lessons: [] } }))).toThrow(
      /plan_version/,
    );
  });

  it("rejects a plan missing module.lessons", () => {
    expect(() => parsePlan(JSON.stringify({ plan_version: 1 }))).toThrow(/module\.lessons/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePlan("{not json")).toThrow(/valid JSON/);
  });
});
