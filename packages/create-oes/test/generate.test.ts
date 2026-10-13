import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsSource,
  validateOcfCourse,
  validateOcfLesson,
  validateOcfModule,
  validateOpfSet,
  validateOqfQuestion,
} from "@inklyre/oes-core";
import { lintCourse } from "@inklyre/oes-lint";
import { generateScaffold } from "../src/generate.js";

describe("generateScaffold", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "create-oes-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a course tree that validates and lints clean end-to-end", async () => {
    const result = await generateScaffold({ outDir: dir, id: "test-course", title: "Test Course" });

    expect(result.files).toEqual([
      "course.json",
      "modules/intro/module.json",
      "modules/intro/lessons/welcome/lesson.json",
      "modules/intro/lessons/welcome/practice-sets/quiz/set.json",
      "modules/intro/lessons/welcome/practice-sets/quiz/questions/example-question.json",
    ]);

    const course = JSON.parse(await readFile(join(dir, "course.json"), "utf8"));
    expect(validateOcfCourse(course).valid).toBe(true);

    const module_ = JSON.parse(await readFile(join(dir, "modules/intro/module.json"), "utf8"));
    expect(validateOcfModule(module_).valid).toBe(true);

    const lesson = JSON.parse(await readFile(join(dir, "modules/intro/lessons/welcome/lesson.json"), "utf8"));
    expect(validateOcfLesson(lesson).valid).toBe(true);

    const set = JSON.parse(
      await readFile(join(dir, "modules/intro/lessons/welcome/practice-sets/quiz/set.json"), "utf8"),
    );
    expect(validateOpfSet(set).valid).toBe(true);

    const question = JSON.parse(
      await readFile(
        join(dir, "modules/intro/lessons/welcome/practice-sets/quiz/questions/example-question.json"),
        "utf8",
      ),
    );
    expect(validateOqfQuestion(question).valid).toBe(true);

    // The real bar: resolvable and lint-clean as a whole tree, not just
    // individually schema-valid documents — a lesson learned building the
    // YouTube importer, where isolated validation missed a real bug.
    const lint = await lintCourse(fsSource(dir), "course.json");
    expect(lint.issues).toEqual([]);
    expect(lint.ok).toBe(true);
  });

  it("refuses to overwrite a non-empty directory without force", async () => {
    await generateScaffold({ outDir: dir, id: "test-course", title: "Test Course" });
    await expect(generateScaffold({ outDir: dir, id: "test-course", title: "Test Course" })).rejects.toThrow(
      /already exists and isn't empty/,
    );
  });

  it("overwrites when force is set", async () => {
    await generateScaffold({ outDir: dir, id: "test-course", title: "Test Course" });
    const result = await generateScaffold({
      outDir: dir,
      id: "test-course",
      title: "Test Course",
      force: true,
    });
    expect(result.files.length).toBe(5);
  });

  it("omits authors/license when not provided, includes them when they are", async () => {
    const bare = await generateScaffold({ outDir: dir, id: "bare", title: "Bare" });
    const bareCourse = JSON.parse(await readFile(join(dir, bare.files[0]), "utf8"));
    expect(bareCourse.authors).toBeUndefined();
    expect(bareCourse.license).toBeUndefined();

    const dir2 = await mkdtemp(join(tmpdir(), "create-oes-"));
    try {
      await generateScaffold({
        outDir: dir2,
        id: "with-meta",
        title: "With Meta",
        authors: ["octocat"],
        license: "CC0-1.0",
      });
      const course = JSON.parse(await readFile(join(dir2, "course.json"), "utf8"));
      expect(course.authors).toEqual(["octocat"]);
      expect(course.license).toBe("CC0-1.0");
    } finally {
      await rm(dir2, { recursive: true, force: true });
    }
  });
});
