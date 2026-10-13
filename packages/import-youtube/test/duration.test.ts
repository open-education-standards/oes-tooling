import { describe, expect, it } from "vitest";
import { parseIso8601Duration } from "../src/duration.js";

describe("parseIso8601Duration", () => {
  it("parses hours, minutes, and seconds", () => {
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
  });

  it("parses minutes and seconds only", () => {
    expect(parseIso8601Duration("PT4M13S")).toBe(253);
  });

  it("parses seconds only", () => {
    expect(parseIso8601Duration("PT45S")).toBe(45);
  });

  it("parses a bare hour", () => {
    expect(parseIso8601Duration("PT2H")).toBe(7200);
  });

  it("returns undefined for a non-duration value (e.g. a live stream's P0D)", () => {
    expect(parseIso8601Duration("P0D")).toBeUndefined();
  });

  it("returns undefined for garbage input", () => {
    expect(parseIso8601Duration("not a duration")).toBeUndefined();
  });
});
