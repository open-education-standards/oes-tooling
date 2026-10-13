import { fileURLToPath } from "node:url";
import { fsSource } from "@inklyre/oes-core";
import { describe, expect, it } from "vitest";
import { lintCourse, lintLesson, lintSet } from "../src/index.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("lintCourse", () => {
  it("reports no issues for a clean course", async () => {
    const result = await lintCourse(fsSource(`${fixturesDir}/clean-course`));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("lintSet", () => {
  it("catches every rule at once in a deliberately broken set", async () => {
    const result = await lintSet(fsSource(`${fixturesDir}/dirty-set`));

    expect(result.ok).toBe(false);
    const rules = result.issues.map((issue) => issue.rule).sort();

    // duplicate top-level entry id "dup", duplicate mcq option id "a", duplicate pool candidate id "c1"
    expect(rules.filter((r) => r === "duplicate-id")).toHaveLength(3);
    // mcq answer "z" doesn't exist, order's correct_order isn't a permutation, match's right_id "r2" doesn't exist
    expect(rules.filter((r) => r === "dangling-answer-reference")).toHaveLength(3);
    // pool1: select (5) exceeds from.length (2)
    expect(rules.filter((r) => r === "pool-select-bounds")).toHaveLength(1);
    // keyed-q's answer_key.file doesn't exist
    expect(rules.filter((r) => r === "answer-key-file-missing")).toHaveLength(1);
  });

  it("reports no issues for a clean set", async () => {
    const result = await lintSet(fsSource(`${fixturesDir}/clean-course/modules/m1/lessons/l1/practice-sets/ps1`));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("lintLesson", () => {
  it("surfaces resolve()'s own dangling-reference errors as issues", async () => {
    const result = await lintLesson(fsSource(`${fixturesDir}/broken-ref-lesson`));
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ rule: "dangling-reference", at: "lesson.items[1]" });
  });
});

describe("answer_key file existence", () => {
  it("accepts a non-JSON answer key that exists", async () => {
    // Regression: the check used source.fetch(), which parses JSON
    // unconditionally, so a perfectly valid Markdown rubric was reported
    // as `answer-key-file-missing`.
    const result = await lintSet(fsSource(`${fixturesDir}/markdown-answer-key`));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
