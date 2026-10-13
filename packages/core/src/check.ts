/**
 * Checking a learner's response to a self-practice question, following the
 * rules in OQF's Question Types page. Pure and synchronous: no fetching, no
 * state, so every consumer checks answers the same way.
 *
 * A question can only be checked here when its answer is in the document.
 * A secured question (one with an `answer_key`) is graded wherever its
 * answer key lives; `code` needs a sandbox to run tests; `short_answer`,
 * `essay` and `submission` are graded by a person. Those all report
 * `not-checkable`, with the reason.
 */
import type { OqfQuestion } from "./types/oqf.js";

export type QuestionResponse =
  | { type: "mcq"; selected?: string }
  | { type: "msq"; selected: string[] }
  | { type: "fill_blank"; blanks: Record<string, string> }
  | { type: "numerical"; value?: number }
  | { type: "order"; order: string[] }
  /** `left_id` → chosen `right_id`. */
  | { type: "match"; pairs: Record<string, string> }
  /** label `id` → the learner's text. */
  | { type: "diagram"; labels: Record<string, string> }
  | { type: "code"; language: string; code: string }
  | { type: "short_answer"; text: string }
  | { type: "essay"; text: string }
  | { type: "submission"; value: string };

export type CheckStatus = "correct" | "partial" | "incorrect" | "unanswered" | "not-checkable";

export interface CheckResult {
  status: CheckStatus;
  /** Points earned, in the question's own scale (see `maxScore`). Can be negative when options carry penalties. */
  score?: number;
  /** Points available: 1 for an all-or-nothing question, or the sum of positive option scores, or the number of blanks/pairs/labels. */
  maxScore?: number;
  /** Why a question can't be checked here. */
  reason?: "graded-elsewhere" | "needs-execution" | "graded-by-a-person";
  /** Per blank, pair (by `left_id`) or label: whether it was right. */
  parts?: Record<string, boolean>;
}

function graded(score: number, maxScore: number, parts?: Record<string, boolean>): CheckResult {
  const status: CheckStatus = score >= maxScore ? "correct" : score > 0 ? "partial" : "incorrect";
  return { status, score, maxScore, ...(parts ? { parts } : {}) };
}

/** Accepted spellings never include surrounding whitespace, so it is ignored. */
const norm = (s: string) => s.trim();

/** Check `response` against `question`. */
export function checkResponse(question: OqfQuestion, response: QuestionResponse | undefined): CheckResult {
  const q = question as OqfQuestion & { answer_key?: unknown };
  if (q.answer_key !== undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
  if (q.type === "code") return { status: "not-checkable", reason: "needs-execution" };
  if (q.type === "short_answer" || q.type === "essay" || q.type === "submission") {
    return { status: "not-checkable", reason: "graded-by-a-person" };
  }
  if (!response || response.type !== q.type) return { status: "unanswered" };

  switch (q.type) {
    case "mcq": {
      const r = response as Extract<QuestionResponse, { type: "mcq" }>;
      if (r.selected === undefined) return { status: "unanswered" };
      const options = q.type_config.options;
      // Any `score` on any option means: sum the selected option's score.
      if (options.some((o) => o.score !== undefined)) {
        const max = Math.max(...options.map((o) => o.score ?? 0));
        return graded(options.find((o) => o.id === r.selected)?.score ?? 0, max);
      }
      if (q.type_config.answer === undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
      return graded(r.selected === q.type_config.answer ? 1 : 0, 1);
    }
    case "msq": {
      const r = response as Extract<QuestionResponse, { type: "msq" }>;
      if (r.selected.length === 0) return { status: "unanswered" };
      const options = q.type_config.options;
      const selected = new Set(r.selected);
      if (options.some((o) => o.score !== undefined)) {
        const sum = options.filter((o) => selected.has(o.id)).reduce((t, o) => t + (o.score ?? 0), 0);
        const max = options.reduce((t, o) => t + Math.max(0, o.score ?? 0), 0);
        return graded(sum, max);
      }
      const answers = q.type_config.answers;
      if (answers === undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
      const exact = answers.length === selected.size && answers.every((a) => selected.has(a));
      return graded(exact ? 1 : 0, 1);
    }
    case "fill_blank": {
      const r = response as Extract<QuestionResponse, { type: "fill_blank" }>;
      const blanks = q.type_config.blanks;
      if (blanks.some((b) => b.answer === undefined)) return { status: "not-checkable", reason: "graded-elsewhere" };
      if (blanks.every((b) => !norm(r.blanks[b.id] ?? ""))) return { status: "unanswered" };
      const parts: Record<string, boolean> = {};
      for (const b of blanks) {
        const accepted = Array.isArray(b.answer) ? b.answer : [b.answer!];
        // case_sensitive only applies to text blanks, and defaults to true.
        const fold = b.type === "text" && b.case_sensitive === false;
        const given = fold ? norm(r.blanks[b.id] ?? "").toLowerCase() : norm(r.blanks[b.id] ?? "");
        parts[b.id] = accepted.some((a) => (fold ? norm(a).toLowerCase() : norm(a)) === given);
      }
      return graded(Object.values(parts).filter(Boolean).length, blanks.length, parts);
    }
    case "numerical": {
      const r = response as Extract<QuestionResponse, { type: "numerical" }>;
      if (r.value === undefined || Number.isNaN(r.value)) return { status: "unanswered" };
      const { answer, tolerance = 0, tolerance_type = "absolute" } = q.type_config;
      if (answer === undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
      const margin = tolerance_type === "percentage" ? (tolerance / 100) * Math.abs(answer) : tolerance;
      // A tiny epsilon so a value exactly on the boundary isn't lost to floating point.
      return graded(Math.abs(r.value - answer) <= margin + 1e-9 * Math.max(1, Math.abs(answer)) ? 1 : 0, 1);
    }
    case "order": {
      const r = response as Extract<QuestionResponse, { type: "order" }>;
      const correct = q.type_config.correct_order;
      if (correct === undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
      if (r.order.length === 0) return { status: "unanswered" };
      const exact = r.order.length === correct.length && r.order.every((id, i) => id === correct[i]);
      return graded(exact ? 1 : 0, 1);
    }
    case "match": {
      const r = response as Extract<QuestionResponse, { type: "match" }>;
      const pairs = q.type_config.pairs;
      if (pairs === undefined) return { status: "not-checkable", reason: "graded-elsewhere" };
      if (Object.keys(r.pairs).length === 0) return { status: "unanswered" };
      const parts: Record<string, boolean> = {};
      for (const p of pairs) parts[p.left_id] = r.pairs[p.left_id] === p.right_id;
      return graded(Object.values(parts).filter(Boolean).length, pairs.length, parts);
    }
    case "diagram": {
      const r = response as Extract<QuestionResponse, { type: "diagram" }>;
      const labels = q.type_config.labels;
      if (labels.some((l) => l.answer === undefined)) return { status: "not-checkable", reason: "graded-elsewhere" };
      if (labels.every((l) => !norm(r.labels[l.id] ?? ""))) return { status: "unanswered" };
      const parts: Record<string, boolean> = {};
      // OQF gives diagram labels no case_sensitive flag; a label names a part,
      // so case is not significant.
      for (const l of labels) parts[l.id] = norm(r.labels[l.id] ?? "").toLowerCase() === norm(l.answer!).toLowerCase();
      return graded(Object.values(parts).filter(Boolean).length, labels.length, parts);
    }
  }
  return { status: "unanswered" };
}
