import type { OqfQuestion } from "@inklyre/oes-core";

/** The OQF version a compiled document is stamped with when frontmatter omits one. */
export const DEFAULT_OQF_VERSION = "0.2.0";

/** Canonical home of the published schemas — the base of the generated `$schema` URL. */
export const DEFAULT_SCHEMA_BASE = "https://open-education-standards.github.io/oes/schemas";

/**
 * Fields the compiler supplies so an author never types them, in the order
 * they're stripped on decompile. `$schema` and `oqf_version` are constants
 * the tooling knows; `id` defaults to the question's folder name, which is
 * already the OPF convention when referencing a question by `path`.
 */
export const INFERRED_FIELDS = ["$schema", "oqf_version", "id"] as const;

export interface CompileOptions {
  /**
   * Value for `id` when frontmatter omits it — conventionally the name of
   * the folder holding the `.oes.md` file. Required unless frontmatter
   * carries an explicit `id`.
   */
  id?: string;
  /** Defaults to {@link DEFAULT_OQF_VERSION}. */
  oqfVersion?: string;
  /**
   * Base URL for the generated `$schema` hint. Pass `null` to omit
   * `$schema` entirely — it's an editor convenience, not content.
   */
  schemaBase?: string | null;
  /**
   * Validate the compiled document against the OQF JSON Schema.
   * Defaults to `true`; turn it off only to inspect a known-invalid
   * document, e.g. to report why it fails.
   */
  validate?: boolean;
}

/** A file the compiler wants written, path relative to the question's folder. */
export interface CompiledFile {
  path: string;
  content: string;
}

export interface CompileResult {
  /** The compiled document — also the parsed form of `question.json`. */
  question: OqfQuestion;
  /**
   * `question.json`, plus the prose file when frontmatter asked for
   * `statement: {file: …}`. Write these relative to the question's folder.
   */
  files: CompiledFile[];
}

export interface DecompileOptions {
  /**
   * Body text for a question whose `statement` is a `{file: …}` reference —
   * the contents of that file. Required in that case: the statement is the
   * body of the authored document, so without it the output would lose the
   * prose.
   */
  statementBody?: string;
  /**
   * Verify the result by compiling it and comparing against the input,
   * throwing {@link RoundTripError} on any difference. Defaults to `true`.
   * Leave it on: it is the only thing standing between a subtle emitter bug
   * and silent content corruption.
   */
  selfCheck?: boolean;
}

/** Thrown when a `.oes.md` document can't be read as one. */
export class AuthoringError extends Error {
  constructor(
    message: string,
    /** 1-based line number in the source document, when the failure has one. */
    readonly line?: number,
  ) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = "AuthoringError";
  }
}

/**
 * Thrown when decompiling produced a document that doesn't compile back to
 * the input. Always a bug in this package rather than in the caller's
 * content — but it surfaces as a refusal to write, never as a silent loss.
 */
export class RoundTripError extends Error {
  constructor(
    message: string,
    readonly detail: { path: string; expected: unknown; actual: unknown }[],
  ) {
    super(message);
    this.name = "RoundTripError";
  }
}
