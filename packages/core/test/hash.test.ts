import { describe, expect, it } from "vitest";
import { contentHashMatches, hashContent } from "../src/hash.js";

describe("hashContent", () => {
  it("hashes to the sha256-{hex} format used by every content_hash field", async () => {
    // Known SHA-256 of the empty string.
    expect(await hashContent("")).toBe("sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("contentHashMatches", () => {
  it("returns true when the declared hash matches the content", async () => {
    const raw = '{"title":"hello"}';
    const hash = await hashContent(raw);
    expect(await contentHashMatches(raw, hash)).toBe(true);
  });

  it("returns false on a mismatch", async () => {
    const raw = '{"title":"hello"}';
    await expect(contentHashMatches(raw, "sha256-" + "0".repeat(64))).resolves.toBe(false);
  });

  it("returns undefined for a malformed declared hash, rather than throwing", async () => {
    await expect(contentHashMatches("anything", "not-a-real-hash")).resolves.toBeUndefined();
  });

  it("is case-insensitive on the declared hash's hex", async () => {
    const raw = "hello";
    const hash = await hashContent(raw);
    const upper = hash.toUpperCase().replace("SHA256-", "sha256-");
    expect(await contentHashMatches(raw, upper)).toBe(true);
  });
});
