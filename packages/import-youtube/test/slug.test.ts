import { describe, expect, it } from "vitest";
import { deriveId, shortHash, slugify } from "../src/slug.js";

describe("slugify", () => {
  it("kebab-cases a plain title", () => {
    expect(slugify("Intro to Algorithms")).toBe("intro-to-algorithms");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("Part 1: What is a Hash Table?!")).toBe("part-1-what-is-a-hash-table");
  });

  it("strips diacritics", () => {
    expect(slugify("Café con leche")).toBe("cafe-con-leche");
  });

  it("truncates long titles without leaving a trailing hyphen", () => {
    const long = "a".repeat(60);
    const slug = slugify(long, 10);
    expect(slug).toBe("aaaaaaaaaa");
    expect(slug.length).toBeLessThanOrEqual(10);
  });

  it("returns an empty string for a title with no kebab-able characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("shortHash", () => {
  it("is deterministic for the same seed", async () => {
    const a = await shortHash("dQw4w9WgXcQ");
    const b = await shortHash("dQw4w9WgXcQ");
    expect(a).toBe(b);
  });

  it("differs for different seeds", async () => {
    const a = await shortHash("videoOne");
    const b = await shortHash("videoTwo");
    expect(a).not.toBe(b);
  });

  it("is 8 lowercase hex characters", async () => {
    const hash = await shortHash("anything");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("deriveId", () => {
  it("produces a valid OES id pattern", async () => {
    const id = await deriveId("Intro to Algorithms!", "dQw4w9WgXcQ", "video");
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(id.startsWith("intro-to-algorithms-")).toBe(true);
  });

  it("falls back to the given fallback when the title has no kebab-able characters", async () => {
    const id = await deriveId("!!!", "seed", "video");
    expect(id.startsWith("video-")).toBe(true);
  });

  it("stays unique for two videos that slugify to the same title", async () => {
    const a = await deriveId("Part 1", "id-one", "video");
    const b = await deriveId("Part 1", "id-two", "video");
    expect(a).not.toBe(b);
  });
});
