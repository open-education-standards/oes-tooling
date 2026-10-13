import { describe, expect, it } from "vitest";
import { extractPlaylistId } from "../src/parse-url.js";

describe("extractPlaylistId", () => {
  it("extracts from a playlist URL", () => {
    expect(extractPlaylistId("https://www.youtube.com/playlist?list=PLabc123XYZ_-")).toBe("PLabc123XYZ_-");
  });

  it("extracts from a watch URL with a list param", () => {
    expect(extractPlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123XYZ")).toBe(
      "PLabc123XYZ",
    );
  });

  it("accepts a bare playlist id", () => {
    expect(extractPlaylistId("PLabc123XYZ_-")).toBe("PLabc123XYZ_-");
  });

  it("returns undefined for a URL with no list param", () => {
    expect(extractPlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
  });

  it("returns undefined for a short, non-id-shaped string", () => {
    expect(extractPlaylistId("hello")).toBeUndefined();
  });
});
