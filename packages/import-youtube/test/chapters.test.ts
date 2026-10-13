import { describe, expect, it } from "vitest";
import { extractChapters } from "../src/chapters.js";

describe("extractChapters", () => {
  it("extracts mm:ss chapters starting at 0:00", () => {
    const description = [
      "Welcome to the video!",
      "",
      "0:00 Introduction",
      "1:23 Setting up",
      "12:45 Wrapping up",
      "",
      "Thanks for watching.",
    ].join("\n");
    expect(extractChapters(description)).toEqual([
      { label: "Introduction", time_seconds: 0 },
      { label: "Setting up", time_seconds: 83 },
      { label: "Wrapping up", time_seconds: 765 },
    ]);
  });

  it("extracts hh:mm:ss chapters", () => {
    const description = "0:00 Start\n1:02:03 Deep dive";
    expect(extractChapters(description)).toEqual([
      { label: "Start", time_seconds: 0 },
      { label: "Deep dive", time_seconds: 3723 },
    ]);
  });

  it("ignores a lone incidental timestamp mention (not real chapters)", () => {
    const description = "Check out the funny part at 4:20 in the demo.";
    expect(extractChapters(description)).toEqual([]);
  });

  it("requires the first chapter to start at 0:00", () => {
    const description = "1:00 First\n2:00 Second";
    expect(extractChapters(description)).toEqual([]);
  });

  it("returns an empty array for a description with no timestamps", () => {
    expect(extractChapters("Just a plain description, nothing timed.")).toEqual([]);
  });
});
