import type { Prose, ProseFile, Reference, Source, Status } from "./common.js";
import type { ExactlyOne } from "./util.js";

/** Shared by `match`'s `left`/`right` columns and `order`'s `items`. */
export interface OqfOption {
  id: string;
  /** Markdown — plain text, a single image, or any number of images interleaved with text. */
  content: string;
}

/** An {@link OqfOption} for `mcq`/`msq`, which can additionally carry a per-option point value — meaningless for match/order, which have no single per-item correctness value to score. */
export interface OqfScoredOption extends OqfOption {
  /**
   * This option's point contribution when selected — supports partial
   * credit and negative-scoring distractors. Absent means the default
   * all-or-nothing behavior: full credit for exactly the option(s)
   * named in `answer`/`answers`, zero for everything else.
   */
  score?: number;
}

/** Either a plain string, or a structured breakdown into named, independently-pointed criteria. */
export type OqfRubric =
  | string
  | { criteria: { name: string; description?: string; points?: number }[] };

/** `{path}` or `{stimulus_url}` — mutually exclusive, exactly one required. */
export type OqfStimulusRef = { content_hash?: string } & ExactlyOne<{ path: string; stimulus_url: string }>;

/**
 * Present: this question is graded/secure, and the type-specific answer
 * field(s) below are omitted from `type_config` (see each `*Config`
 * type's `answer`-shaped field) — a grading consumer fetches them from
 * wherever this points instead. Absent: self-practice, `type_config`
 * carries its answer inline as usual.
 */
export type OqfAnswerKey = { content_hash?: string } & ExactlyOne<{ file: string; url: string }>;

export interface OqfMcqConfig {
  options: OqfScoredOption[];
  /** One option's `id`. Absent when secured via a top-level `answer_key`. */
  answer?: string;
  shuffle_options?: boolean;
}

export interface OqfMsqConfig {
  options: OqfScoredOption[];
  /** Option `id`s. Absent when secured via a top-level `answer_key`. */
  answers?: string[];
  shuffle_options?: boolean;
}

export interface OqfFillBlankBlank {
  id: string;
  type: "text" | "expression" | "number";
  /**
   * One accepted answer, or a list of them — a response matching ANY
   * member is correct, which is how equivalent spellings of the same
   * answer are handled (`"O(log n)"`, `"O(logn)"`, `"Θ(log n)"`).
   * Matching is exact against each member, with {@link case_sensitive}
   * applied uniformly; there is no fuzzy matching, so a blank is only as
   * forgiving as its list. Absent when secured via a top-level
   * `answer_key` (keyed by `id` there instead).
   */
  answer?: string | string[];
  case_sensitive?: boolean;
}

export interface OqfFillBlankConfig {
  blanks: OqfFillBlankBlank[];
}

export interface OqfCodeTestCase {
  id: string;
  input: unknown;
  /** Absent for `is_hidden` cases when secured via `answer_key`; required otherwise. */
  expected?: unknown;
  is_hidden?: boolean;
  /** This test case's weight, for a consumer computing a proportional score. */
  points?: number;
  time_limit_ms?: number;
  memory_limit_mb?: number;
}

/** A starter-code entry split into a fixed, non-editable prefix/suffix around an editable template — for boilerplate or harness code the learner shouldn't see or touch. */
export interface OqfStarterCodeRegions {
  prefix?: string;
  template: string;
  suffix?: string;
}

export interface OqfCodeConfig {
  languages: string[];
  /** Map of language to starter code — a plain string (the whole editable body, the common case) or {@link OqfStarterCodeRegions} for locked boilerplate around an editable region. */
  starter_code?: Record<string, string | OqfStarterCodeRegions>;
  test_cases: OqfCodeTestCase[];
  /** Map of language to a reference solution. Always absent when secured via `answer_key`. */
  solutions?: Record<string, string>;
  time_limit_ms?: number;
  memory_limit_mb?: number;
  time_complexity?: string;
  space_complexity?: string;
}

export interface OqfMatchPair {
  left_id: string;
  right_id: string;
}

export interface OqfMatchConfig {
  left: OqfOption[];
  /** May include more items than `left`, as unmatched distractors. */
  right: OqfOption[];
  /** The correct associations. Absent when secured via a top-level `answer_key`. */
  pairs?: OqfMatchPair[];
  shuffle?: boolean;
}

export interface OqfOrderConfig {
  /** Storable in any order — position carries no meaning; only `correct_order` does. */
  items: OqfOption[];
  /** `items`' `id`s in correct sequence. Absent when secured via a top-level `answer_key`. */
  correct_order?: string[];
  shuffle?: boolean;
}

export interface OqfNumericalConfig {
  /** Absent when secured via a top-level `answer_key`. */
  answer?: number;
  tolerance?: number;
  tolerance_type?: "absolute" | "percentage";
  unit?: string;
}

export interface OqfShortAnswerConfig {
  grading: "manual";
  max_words?: number;
  rubric?: OqfRubric;
}

export interface OqfEssayConfig {
  grading: "manual";
  min_words?: number;
  max_words?: number;
  rubric?: OqfRubric;
}

export interface OqfSubmissionConfig {
  formats: ("file" | "url" | "git_repo")[];
  /** Only meaningful when `"file"` is an accepted format. */
  max_file_size_mb?: number;
  /** Only meaningful when `"file"` is an accepted format. */
  allowed_file_types?: string[];
  grading: "manual";
  rubric?: OqfRubric;
}

export interface OqfDiagramLabel {
  id: string;
  /** Absent when secured via a top-level `answer_key` (keyed by `id` there instead). */
  answer?: string;
  /** Percentage-based coordinates (0-100) from the top-left of the image. */
  position: { x: number; y: number };
}

export interface OqfDiagramConfig {
  /**
   * Path, relative to the question's folder, to the image asset — or the
   * object form carrying that path plus a `content_hash`, for a question
   * fetched by URL whose image would otherwise be resolved relative to
   * that URL and left unverified.
   */
  image: string | ProseFile;
  labels: OqfDiagramLabel[];
}

interface OqfQuestionBase {
  oqf_version: string;
  id: string;
  title: string;
  difficulty?: "easy" | "medium" | "hard";
  status?: Status;
  authors?: string[];
  license?: string;
  tags?: string[];
  topics?: string[];
  companies?: string[];
  /** Suggested time limit. Authored intent a consuming platform MAY enforce — advisory, not a mechanism OQF itself implements. */
  time_limit_mins?: number;
  /** Suggested attempt limit, same advisory status as {@link time_limit_mins}. Absent means unlimited. */
  max_attempts?: number;
  /** Ordered least to most revealing. */
  hints?: string[];
  explanation?: string;
  references?: Reference[];
  source?: Source;
  /**
   * A plain string is the statement inline, as Markdown. `{file}` points at
   * a sibling Markdown file instead, path relative to this question's own
   * folder — conventionally `statement.md`.
   */
  statement: string | { file: string };
  stimulus?: OqfStimulusRef;
  answer_key?: OqfAnswerKey;
}

/**
 * `question.json` (OQF v0.1.0), discriminated on `type` — narrowing on
 * `type` also narrows `type_config` to that type's own shape.
 */
export type OqfQuestion =
  | (OqfQuestionBase & { type: "mcq"; type_config: OqfMcqConfig })
  | (OqfQuestionBase & { type: "msq"; type_config: OqfMsqConfig })
  | (OqfQuestionBase & { type: "fill_blank"; type_config: OqfFillBlankConfig })
  | (OqfQuestionBase & { type: "code"; type_config: OqfCodeConfig })
  | (OqfQuestionBase & { type: "match"; type_config: OqfMatchConfig })
  | (OqfQuestionBase & { type: "order"; type_config: OqfOrderConfig })
  | (OqfQuestionBase & { type: "numerical"; type_config: OqfNumericalConfig })
  | (OqfQuestionBase & { type: "short_answer"; type_config: OqfShortAnswerConfig })
  | (OqfQuestionBase & { type: "essay"; type_config: OqfEssayConfig })
  | (OqfQuestionBase & { type: "diagram"; type_config: OqfDiagramConfig })
  | (OqfQuestionBase & { type: "submission"; type_config: OqfSubmissionConfig });

export type OqfQuestionType = OqfQuestion["type"];

/** `stimulus.json` — a shared prompt referenced by one or more questions (OQF v0.2.0). */
export interface OqfStimulus {
  oqf_version: string;
  id: string;
  title?: string;
  /**
   * The shared prompt. Optional — a stimulus that is purely an image or
   * dataset in `assets/` has no prose at all. Prefer the inline form for
   * a stimulus referenced by `stimulus_url`: this is the document OES
   * most actively recommends hosting independently, so it is where an
   * uncovered `content_hash` does the most damage.
   */
  content?: Prose;
  authors?: string[];
  license?: string;
  tags?: string[];
  source?: Source;
}
