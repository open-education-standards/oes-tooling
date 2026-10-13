import { describe, expect, it } from "vitest";
import { checkResponse, type OqfQuestion } from "../src/index.js";

const q = (type: string, type_config: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ oqf_version: "0.2.0", id: "q", title: "Q", statement: "S", type, type_config, ...extra }) as unknown as OqfQuestion;

const options = [
  { id: "a", content: "A" },
  { id: "b", content: "B" },
  { id: "c", content: "C" },
  { id: "d", content: "D" },
];

describe("checkResponse", () => {
  it("mcq: the option named in answer is right, anything else wrong", () => {
    const mcq = q("mcq", { options, answer: "a" });
    expect(checkResponse(mcq, { type: "mcq", selected: "a" })).toEqual({ status: "correct", score: 1, maxScore: 1 });
    expect(checkResponse(mcq, { type: "mcq", selected: "b" }).status).toBe("incorrect");
    expect(checkResponse(mcq, { type: "mcq" }).status).toBe("unanswered");
  });

  it("msq: all and only the correct options, unless options carry scores", () => {
    const msq = q("msq", { options, answers: ["a", "c"] });
    expect(checkResponse(msq, { type: "msq", selected: ["c", "a"] }).status).toBe("correct");
    expect(checkResponse(msq, { type: "msq", selected: ["a"] }).status).toBe("incorrect");
    expect(checkResponse(msq, { type: "msq", selected: ["a", "c", "d"] }).status).toBe("incorrect");
  });

  it("msq with scores: sums the selected options, penalties included (the spec's own example)", () => {
    const scored = q("msq", {
      options: [
        { id: "a", content: "Merge sort", score: 0.5 },
        { id: "b", content: "Quick sort", score: 0 },
        { id: "c", content: "Insertion sort", score: 0.5 },
        { id: "d", content: "Heap sort", score: -1 },
      ],
      answers: ["a", "c"],
    });
    expect(checkResponse(scored, { type: "msq", selected: ["a", "c"] })).toEqual({ status: "correct", score: 1, maxScore: 1 });
    expect(checkResponse(scored, { type: "msq", selected: ["a"] })).toMatchObject({ status: "partial", score: 0.5 });
    expect(checkResponse(scored, { type: "msq", selected: ["a", "d"] })).toMatchObject({ status: "incorrect", score: -0.5 });
  });

  it("fill_blank: any accepted spelling, case folding only for text blanks that ask for it", () => {
    const fb = q("fill_blank", {
      blanks: [
        { id: "b1", answer: ["O(log n)", "O(logn)", "Θ(log n)"], type: "text", case_sensitive: false },
        { id: "b2", answer: "ceil(log2(n))", type: "expression" },
      ],
    });
    expect(checkResponse(fb, { type: "fill_blank", blanks: { b1: "o(LOGN)", b2: " ceil(log2(n)) " } })).toEqual({
      status: "correct",
      score: 2,
      maxScore: 2,
      parts: { b1: true, b2: true },
    });
    const half = checkResponse(fb, { type: "fill_blank", blanks: { b1: "Θ(log n)", b2: "CEIL(log2(n))" } });
    expect(half).toMatchObject({ status: "partial", parts: { b1: true, b2: false } });
    expect(checkResponse(fb, { type: "fill_blank", blanks: {} }).status).toBe("unanswered");
  });

  it("fill_blank: text blanks are case-sensitive by default", () => {
    const fb = q("fill_blank", { blanks: [{ id: "b", answer: "Paris", type: "text" }] });
    expect(checkResponse(fb, { type: "fill_blank", blanks: { b: "paris" } }).status).toBe("incorrect");
  });

  it("numerical: absolute and percentage tolerance, boundaries included", () => {
    const abs = q("numerical", { answer: 42.5, tolerance: 0.1 });
    expect(checkResponse(abs, { type: "numerical", value: 42.6 }).status).toBe("correct");
    expect(checkResponse(abs, { type: "numerical", value: 42.61 }).status).toBe("incorrect");
    const pct = q("numerical", { answer: 1500000, tolerance: 1, tolerance_type: "percentage" });
    expect(checkResponse(pct, { type: "numerical", value: 1515000 }).status).toBe("correct");
    expect(checkResponse(pct, { type: "numerical", value: 1515001 }).status).toBe("incorrect");
    expect(checkResponse(q("numerical", { answer: 3 }), { type: "numerical", value: 3 }).status).toBe("correct");
    expect(checkResponse(abs, { type: "numerical", value: Number.NaN }).status).toBe("unanswered");
  });

  it("order: the exact sequence", () => {
    const order = q("order", { items: options, correct_order: ["a", "b", "c", "d"] });
    expect(checkResponse(order, { type: "order", order: ["a", "b", "c", "d"] }).status).toBe("correct");
    expect(checkResponse(order, { type: "order", order: ["b", "a", "c", "d"] }).status).toBe("incorrect");
  });

  it("match: credit per correctly matched left item", () => {
    const match = q("match", {
      left: [{ id: "l1", content: "x" }, { id: "l2", content: "y" }],
      right: [{ id: "r1", content: "1" }, { id: "r2", content: "2" }, { id: "r3", content: "distractor" }],
      pairs: [{ left_id: "l1", right_id: "r1" }, { left_id: "l2", right_id: "r2" }],
    });
    expect(checkResponse(match, { type: "match", pairs: { l1: "r1", l2: "r3" } })).toEqual({
      status: "partial",
      score: 1,
      maxScore: 2,
      parts: { l1: true, l2: false },
    });
  });

  it("diagram: label text, ignoring case and surrounding space", () => {
    const d = q("diagram", { image: "a.png", labels: [{ id: "l1", answer: "root", position: { x: 1, y: 1 } }] });
    expect(checkResponse(d, { type: "diagram", labels: { l1: " Root " } }).status).toBe("correct");
  });

  it("never checks what it can't: secured, code, and person-graded questions", () => {
    expect(checkResponse(q("mcq", { options }, { answer_key: { file: "k.json" } }), { type: "mcq", selected: "a" })).toEqual({
      status: "not-checkable",
      reason: "graded-elsewhere",
    });
    expect(checkResponse(q("mcq", { options }, { answer_key: { withheld: true } }), undefined).reason).toBe("graded-elsewhere");
    expect(checkResponse(q("code", { languages: ["python"], test_cases: [] }), undefined).reason).toBe("needs-execution");
    for (const type of ["short_answer", "essay", "submission"]) {
      expect(checkResponse(q(type, { grading: "manual" }), undefined).reason).toBe("graded-by-a-person");
    }
  });

  it("treats a response for a different type as unanswered", () => {
    expect(checkResponse(q("mcq", { options, answer: "a" }), { type: "msq", selected: ["a"] }).status).toBe("unanswered");
  });
});
