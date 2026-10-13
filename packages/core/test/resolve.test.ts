import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fsSource } from "../src/content-source.js";
import { resolveCourse, resolveLesson } from "../src/resolve.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("resolveCourse", () => {
  it("walks the full tree — course → module → lesson → item (article/practice set) → question → stimulus", async () => {
    const { data, errors } = await resolveCourse(fsSource(`${fixturesDir}/course`));

    expect(errors).toEqual([]);
    expect(data?.course.id).toBe("test-course");

    expect(data?.modules).toHaveLength(1);
    const module_ = data!.modules[0]!;
    expect(module_.module.id).toBe("m1");

    expect(module_.lessons).toHaveLength(1);
    const lesson = module_.lessons[0]!;
    expect(lesson.lesson.id).toBe("l1");
    expect(lesson.lesson.related?.[0]?.title).toBe("Watch next");

    expect(lesson.items).toHaveLength(3);
    const article = lesson.items[0]!;
    expect(article.type).toBe("article");
    if (article.type === "article") {
      expect(article.article.title).toBe("Article One");
    }

    const item = lesson.items[1]!;
    expect(item.type).toBe("practice_set");
    if (item.type !== "practice_set") throw new Error("expected practice_set");
    expect(item.set.title).toBe("Practice Set One");

    expect(item.questions).toHaveLength(1);
    const question = item.questions[0]!;
    expect(question.question.title).toBe("Question One");
    expect(question.question.type).toBe("mcq");
    if (question.question.type === "mcq") {
      // Narrowed by the discriminant — type_config.options is only visible here.
      expect(question.question.type_config.options).toHaveLength(2);
    }
    expect(question.stimulus?.title).toBe("Shared Stimulus");

    const resource = lesson.items[2]!;
    expect(resource.type).toBe("resource");
    if (resource.type !== "resource") throw new Error("expected resource");
    expect(resource.resource.title).toBe("Cheat Sheet");
    expect(resource.resource.page_count).toBe(2);
  });

  it("collects a broken reference as an error instead of failing the whole resolution", async () => {
    const { data, errors } = await resolveLesson(fsSource(`${fixturesDir}/broken-ref`));

    expect(data?.items).toHaveLength(1);
    const item = data!.items[0]!;
    if (item.type !== "article") throw new Error("expected article");
    expect(item.article.title).toBe("The Good Article");

    expect(errors).toHaveLength(1);
    expect(errors[0]!.at).toBe("lesson.items[1]");
    expect(errors[0]!.message).toContain("Failed to resolve article");
  });

  it("reports a content_hash mismatch as an error, without failing resolution", async () => {
    const { data, errors } = await resolveLesson(fsSource(`${fixturesDir}/hash-mismatch`));

    expect(data?.items).toHaveLength(1);
    const item = data!.items[0]!;
    if (item.type !== "article") throw new Error("expected article");
    expect(item.article.title).toBe("Article With Declared Hash");

    expect(errors).toHaveLength(1);
    expect(errors[0]!.at).toBe("lesson.items[0]");
    expect(errors[0]!.message).toContain("content_hash mismatch");
  });

  it("reports an error and no data when the entry point itself doesn't exist", async () => {
    const { data, errors } = await resolveCourse(fsSource(fixturesDir), "does-not-exist/course.json");

    expect(data).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.at).toBe("course");
  });
});

describe("prose inlining", () => {
  it("resolves an article's content to a string, never a file reference", async () => {
    const { data, errors } = await resolveCourse(fsSource(`${fixturesDir}/course`));
    expect(errors).toEqual([]);

    const article = data!.modules[0]!.lessons[0]!.items[0]!;
    if (article.type !== "article") throw new Error("expected article");
    expect(typeof article.article.content).toBe("string");
    expect(article.article.content).toContain("Intro article prose");
  });

  it("resolves a stimulus's content to a string", async () => {
    const { data } = await resolveCourse(fsSource(`${fixturesDir}/course`));
    const item = data!.modules[0]!.lessons[0]!.items[1]!;
    if (item.type !== "practice_set") throw new Error("expected practice_set");

    const stimulus = item.questions[0]!.stimulus;
    expect(typeof stimulus?.content).toBe("string");
    expect(stimulus?.content).toContain("shared prompt");
  });

  it("reports a missing prose file as an error rather than throwing", async () => {
    const { errors } = await resolveLesson(fsSource(`${fixturesDir}/missing-prose`));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/Failed to read prose file "content\.md"/);
  });
});
