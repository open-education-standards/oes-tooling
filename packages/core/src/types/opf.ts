import type { Source, Status } from "./common.js";
import type { ExactlyOne } from "./util.js";

/** A pool's candidate question — same reference shape as a direct entry, minus `points`/`title`. */
export type OpfPoolCandidate = { id: string; content_hash?: string } & ExactlyOne<{
  path: string;
  question_url: string;
}>;

interface OpfQuestionEntryBase {
  id: string;
  title?: string;
  points?: number;
  content_hash?: string;
}

/** A direct reference to one question. */
export type OpfDirectQuestionEntry = OpfQuestionEntryBase & ExactlyOne<{ path: string; question_url: string }>;

/**
 * A pool: at attempt-assembly time, a consumer randomly picks `select`
 * questions from `from` in place of this one entry.
 */
export interface OpfPoolQuestionEntry {
  id: string;
  points?: number;
  /** MUST be <= `from.length` — not enforceable by schema alone, see `@inklyre/oes-core`'s lint tooling. */
  select: number;
  from: OpfPoolCandidate[];
  shuffle?: boolean;
}

/**
 * A multi-part question: several entries presented together under one
 * heading, as a past paper's Q3 (a)/(b)/(c).
 *
 * Grouping lives here rather than in OQF because a `multi_part` question
 * type would make {@link OqfQuestion} recursive and break the "one
 * question = one gradeable item" invariant every consumer relies on. A
 * set is already a container, so nesting inside `questions[]` costs
 * nothing. The shared stem is not here either: it belongs on each part's
 * own question via OQF's `stimulus`, which is what keeps every part
 * independently resolvable.
 */
export interface OpfGroupQuestionEntry {
  id: string;
  /**
   * Display label — `"3"` for the group, `"a"` or `"ii"` for a part. A
   * consumer derives `a, b, c…` from position when absent; set it
   * explicitly to reproduce a real paper's numbering. Display only.
   */
  label?: string;
  title?: string;
  /**
   * Ordered sub-entries. Each is an ordinary entry, so parts may be of
   * different question types and a part may itself have `parts`.
   *
   * Parts MUST NOT be reordered, and a consumer shuffling a set MUST move
   * the group as a unit — later parts routinely refer to earlier ones by
   * label ("explain why the index in (b) helps").
   */
  parts: OpfQuestionEntry[];
  /**
   * "Answer any N of these parts." Every part is shown and the learner
   * chooses — deliberately distinct from {@link OpfPoolQuestionEntry.select},
   * where the system picks at random and the learner never sees the rest.
   * MUST be <= `parts.length`; not enforceable by schema alone, see
   * `@inklyre/oes-lint`. Advisory intent a platform MAY enforce.
   */
  answer_any?: number;
}

export type OpfQuestionEntry =
  | OpfDirectQuestionEntry
  | OpfPoolQuestionEntry
  | OpfGroupQuestionEntry;

export function isOpfPoolEntry(entry: OpfQuestionEntry): entry is OpfPoolQuestionEntry {
  return "select" in entry && "from" in entry;
}

export function isOpfGroupEntry(entry: OpfQuestionEntry): entry is OpfGroupQuestionEntry {
  return "parts" in entry;
}

/**
 * Flatten a `questions[]` list to the direct entries it ultimately
 * contains, descending through groups. Pools are returned as-is — their
 * candidates are only chosen at attempt-assembly time, which is a
 * consumer decision rather than a structural one.
 */
export function flattenEntries(entries: OpfQuestionEntry[]): OpfQuestionEntry[] {
  return entries.flatMap((entry) =>
    isOpfGroupEntry(entry) ? flattenEntries(entry.parts) : [entry],
  );
}

/** `set.json` — an ordered collection of question references plus set-level metadata (OPF v0.3.0). */
export interface OpfSet {
  opf_version: string;
  id: string;
  title: string;
  description?: string;
  authors?: string[];
  license?: string;
  status?: Status;
  tags?: string[];
  language?: string;
  source?: Source;
  questions: OpfQuestionEntry[];
}
