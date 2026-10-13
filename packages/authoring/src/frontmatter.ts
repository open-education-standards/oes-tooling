import { parse as parseYaml } from "yaml";
import { AuthoringError } from "./types.js";

const DELIMITER = "---";

export interface SplitDocument {
  /** Raw frontmatter text, delimiters excluded. */
  frontmatter: string;
  /** Everything after the closing delimiter's newline, verbatim. */
  body: string;
  /** 1-based line the body starts on, so body errors can be reported against the source. */
  bodyLine: number;
}

/**
 * Strip a UTF-8 BOM and normalise CRLF/CR to LF.
 *
 * Newline normalisation is deliberate rather than incidental: YAML itself
 * normalises line breaks inside block scalars, so a CRLF document could
 * not round-trip byte-for-byte no matter what this package did. Doing it
 * once, up front, means every downstream comparison is against the same
 * form and a Windows checkout behaves identically to a POSIX one.
 */
export function normalizeSource(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/**
 * Split a `.oes.md` document into frontmatter and body.
 *
 * The delimiter rule is intentionally strict, because frontmatter libraries
 * disagree about it and the disagreement is silent: only a `---` on the
 * very first line opens frontmatter, and only the first subsequent line
 * that is exactly `---` closes it. Everything after that is body, untouched
 * — so a horizontal rule or a YAML-looking line inside a statement can
 * never be mistaken for a delimiter.
 */
export function splitDocument(source: string): SplitDocument {
  const text = normalizeSource(source);
  const lines = text.split("\n");

  if (lines[0]?.trimEnd() !== DELIMITER) {
    throw new AuthoringError(
      "expected the document to open with a '---' frontmatter delimiter on line 1",
      1,
    );
  }

  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === DELIMITER);
  if (closing === -1) {
    throw new AuthoringError("frontmatter is never closed — expected a line containing only '---'");
  }

  // Every frontmatter line was newline-terminated in the source — the
  // closing delimiter follows it. Re-joining without restoring that final
  // newline silently drops one trailing line break from a `|+` block
  // scalar, which is precisely the value it exists to preserve.
  const frontmatterLines = lines.slice(1, closing);

  return {
    frontmatter: frontmatterLines.length === 0 ? "" : `${frontmatterLines.join("\n")}\n`,
    body: lines.slice(closing + 1).join("\n"),
    bodyLine: closing + 2,
  };
}

/**
 * Parse frontmatter into a plain object.
 *
 * YAML 1.2 is a superset of JSON, so a `{ … }` flow mapping parses here
 * with no extra code and no syntax sniffing — a generator that finds JSON
 * easier to emit than YAML can write JSON and this accepts it. Output is
 * always YAML, so the two never diverge into separate dialects.
 */
export function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter, { uniqueKeys: true, strict: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new AuthoringError(`frontmatter is not valid YAML: ${message}`);
  }

  if (parsed === null || parsed === undefined) {
    throw new AuthoringError("frontmatter is empty — at least 'type' and 'title' are required");
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthoringError("frontmatter must be a mapping of fields, not a list or scalar");
  }
  return parsed as Record<string, unknown>;
}
