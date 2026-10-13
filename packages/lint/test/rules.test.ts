import { describe, expect, it } from "vitest";
import type { LintIssue } from "../src/types.js";
import { checkUniqueIds } from "../src/rules/unique-ids.js";
import { checkIdExists, checkPermutation } from "../src/rules/answer-references.js";
import { checkPoolBounds } from "../src/rules/pool-bounds.js";
import { checkGroupStimulusAgreement, checkGroupStructure } from "../src/rules/group-structure.js";
import type { OpfGroupQuestionEntry } from "@inklyre/oes-core";

describe("checkUniqueIds", () => {
  it("reports nothing for all-unique ids", () => {
    const issues: LintIssue[] = [];
    checkUniqueIds([{ id: "a" }, { id: "b" }], "items", issues);
    expect(issues).toEqual([]);
  });

  it("reports each repeat, pointing back at the first occurrence", () => {
    const issues: LintIssue[] = [];
    checkUniqueIds([{ id: "a" }, { id: "b" }, { id: "a" }], "items", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "duplicate-id", severity: "error", at: "items[2]" });
    expect(issues[0]!.message).toContain("items[0]");
  });
});

describe("checkIdExists", () => {
  it("reports nothing when the id is present", () => {
    const issues: LintIssue[] = [];
    checkIdExists("a", [{ id: "a" }, { id: "b" }], "answer", issues);
    expect(issues).toEqual([]);
  });

  it("reports a dangling reference", () => {
    const issues: LintIssue[] = [];
    checkIdExists("z", [{ id: "a" }, { id: "b" }], "answer", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "dangling-answer-reference", severity: "error", at: "answer" });
  });
});

describe("checkPermutation", () => {
  const items = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];

  it("accepts an exact permutation", () => {
    const issues: LintIssue[] = [];
    checkPermutation(["s2", "s1", "s3"], items, "correct_order", issues);
    expect(issues).toEqual([]);
  });

  it("rejects a missing id", () => {
    const issues: LintIssue[] = [];
    checkPermutation(["s1", "s2"], items, "correct_order", issues);
    expect(issues).toHaveLength(1);
  });

  it("rejects a duplicate id", () => {
    const issues: LintIssue[] = [];
    checkPermutation(["s1", "s1", "s3"], items, "correct_order", issues);
    expect(issues).toHaveLength(1);
  });

  it("rejects an id not in items", () => {
    const issues: LintIssue[] = [];
    checkPermutation(["s1", "s2", "s4"], items, "correct_order", issues);
    expect(issues).toHaveLength(1);
  });
});

describe("checkPoolBounds", () => {
  it("accepts select within [1, from.length]", () => {
    const issues: LintIssue[] = [];
    checkPoolBounds({ id: "p1", select: 2, from: [{ id: "c1", path: "c1" }, { id: "c2", path: "c2" }] }, "pool", issues);
    expect(issues).toEqual([]);
  });

  it("rejects select > from.length", () => {
    const issues: LintIssue[] = [];
    checkPoolBounds({ id: "p1", select: 3, from: [{ id: "c1", path: "c1" }, { id: "c2", path: "c2" }] }, "pool", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "pool-select-bounds" });
  });

  it("rejects select < 1", () => {
    const issues: LintIssue[] = [];
    checkPoolBounds({ id: "p1", select: 0, from: [{ id: "c1", path: "c1" }] }, "pool", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "pool-select-bounds" });
  });

  it("also flags duplicate candidate ids within from", () => {
    const issues: LintIssue[] = [];
    checkPoolBounds({ id: "p1", select: 1, from: [{ id: "c1", path: "c1" }, { id: "c1", path: "c1-again" }] }, "pool", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "duplicate-id" });
  });
});

describe("checkGroupStructure", () => {
  const group = (over: Partial<OpfGroupQuestionEntry> = {}): OpfGroupQuestionEntry => ({
    id: "q3",
    label: "3",
    parts: [
      { id: "q3a", label: "a", path: "questions/a" },
      { id: "q3b", label: "b", path: "questions/b" },
    ],
    ...over,
  });

  it("accepts a well-formed group", () => {
    const issues: LintIssue[] = [];
    checkGroupStructure(group(), "set.questions[0]", issues);
    expect(issues).toEqual([]);
  });

  it("errors when answer_any exceeds the number of parts", () => {
    const issues: LintIssue[] = [];
    checkGroupStructure(group({ answer_any: 3 }), "set.questions[0]", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("group-answer-any-bounds");
    expect(issues[0]!.severity).toBe("error");
  });

  it("allows answer_any equal to the number of parts", () => {
    const issues: LintIssue[] = [];
    checkGroupStructure(group({ answer_any: 2 }), "set.questions[0]", issues);
    expect(issues).toEqual([]);
  });

  it("warns about a single-part group without rejecting it", () => {
    const issues: LintIssue[] = [];
    checkGroupStructure(group({ parts: [{ id: "q3a", path: "questions/a" }] }), "set.questions[0]", issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("group-single-part");
    expect(issues[0]!.severity).toBe("warning");
  });

  it("accepts two levels of nesting and warns at three", () => {
    const twoDeep = group({ parts: [{ id: "q3a", parts: [{ id: "q3ai", path: "q/1" }, { id: "q3aii", path: "q/2" }] }] });
    const issues: LintIssue[] = [];
    checkGroupStructure(twoDeep, "set.questions[0]", issues);
    expect(issues.filter((i) => i.rule === "group-nesting-depth")).toEqual([]);

    const threeDeep = group({
      parts: [{ id: "a", parts: [{ id: "b", parts: [{ id: "c", path: "q/1" }, { id: "d", path: "q/2" }] }] }],
    });
    const deepIssues: LintIssue[] = [];
    checkGroupStructure(threeDeep, "set.questions[0]", deepIssues);
    expect(deepIssues.some((i) => i.rule === "group-nesting-depth")).toBe(true);
  });
});

describe("checkGroupStimulusAgreement", () => {
  const group: OpfGroupQuestionEntry = {
    id: "q3",
    parts: [
      { id: "q3a", path: "questions/a" },
      { id: "q3b", path: "questions/b" },
    ],
  };

  it("is quiet when every part shares one stimulus", () => {
    const issues: LintIssue[] = [];
    checkGroupStimulusAgreement(group, () => "../../stimuli/shared", "set.questions[0]", issues);
    expect(issues).toEqual([]);
  });

  it("warns when parts disagree — invisible in set.json, since the stem lives on each question", () => {
    const issues: LintIssue[] = [];
    checkGroupStimulusAgreement(
      group,
      (id) => (id === "q3a" ? "../../stimuli/one" : "../../stimuli/two"),
      "set.questions[0]",
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("group-stimulus-mismatch");
    expect(issues[0]!.severity).toBe("warning");
  });

  it("warns when one part has a stimulus and another has none", () => {
    const issues: LintIssue[] = [];
    checkGroupStimulusAgreement(group, (id) => (id === "q3a" ? "../../stimuli/one" : undefined), "set.questions[0]", issues);
    expect(issues).toHaveLength(1);
  });
});
