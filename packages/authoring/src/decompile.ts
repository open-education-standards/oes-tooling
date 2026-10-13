import { Document, isMap, isScalar, isSeq, visit, type Node } from "yaml";
import type { OqfQuestion } from "@inklyre/oes-core";
import { compileQuestion } from "./compile.js";
import { DIRECTIVE_COLLECTIONS, renderDirectives, type DirectiveName } from "./directives.js";
import { normalizeSource } from "./frontmatter.js";
import {
  DEFAULT_OQF_VERSION,
  DEFAULT_SCHEMA_BASE,
  RoundTripError,
  type DecompileOptions,
} from "./types.js";

/**
 * Frontmatter key order — the author's reading order, not the schema's.
 * Identity first, then the fields an author actually edits, with bulky
 * `type_config` and trailing metadata last.
 */
const AUTHORED_ORDER = [
  "$schema",
  "oqf_version",
  "id",
  "type",
  "title",
  "difficulty",
  "status",
  "authors",
  "license",
  "tags",
  "topics",
  "companies",
  "time_limit_mins",
  "max_attempts",
  "answer_key",
  "stimulus",
  "statement",
  "type_config",
  "hints",
  "explanation",
  "references",
  "source",
] as const;

const MAX_FLOW_WIDTH = 72;

function canonicalSchemaUrl(version: string): string {
  const major = version.split(".").slice(0, 2).join(".");
  return `${DEFAULT_SCHEMA_BASE}/oqf/v${major}.0/question.schema.json`;
}

/**
 * Whether an option's content belongs in a `:::option` body block rather
 * than inline in frontmatter.
 *
 * This is a *policy*, not something derivable from the content — which is
 * exactly why it's pinned here rather than left to taste. Multi-line text,
 * images, and code fences are the cases where YAML quoting starts fighting
 * Markdown; short plain text stays inline where it reads better.
 *
 * Content ending in a newline is deliberately excluded. A `:::` block is
 * delimited by lines, so it cannot represent its own trailing blank lines —
 * whereas a YAML block scalar can, via its chomping indicator. Preferring
 * the representation that survives beats preferring the prettier one.
 */
function needsBlock(content: unknown): boolean {
  return (
    typeof content === "string" &&
    !content.endsWith("\n") &&
    (content.includes("\n") || /!\[[^\]]*\]\(/.test(content) || content.includes("```"))
  );
}

function canFlow(node: Node): boolean {
  const items = isSeq(node)
    ? node.items
    : isMap(node)
      ? node.items.map((pair) => pair.value)
      : [];
  if (items.length === 0) return false;
  if (!items.every((item) => isScalar(item))) return false;
  if (items.some((item) => isScalar(item) && typeof item.value === "string" && item.value.includes("\n"))) {
    return false;
  }
  return JSON.stringify(node.toJSON()).length <= MAX_FLOW_WIDTH;
}

function toYaml(value: Record<string, unknown>): string {
  const doc = new Document(value);
  visit(doc, {
    Seq(_key, node) {
      if (canFlow(node)) node.flow = true;
    },
    Map(_key, node) {
      if (canFlow(node)) node.flow = true;
    },
  });
  // Wrapping long prose keeps diffs readable. It is safe here only because
  // the emitter switches to a quoted style rather than folding whenever
  // folding would not survive a re-read — content with doubled spaces, say,
  // or a line beginning with whitespace. Every hazard in the round-trip
  // suite is checked against this exact setting.
  return doc.toString({ lineWidth: 80 });
}

function orderAuthored(doc: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of AUTHORED_ORDER) {
    if (key in doc) ordered[key] = doc[key];
  }
  for (const [key, value] of Object.entries(doc)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

interface Entry {
  id?: unknown;
  content?: unknown;
}

/**
 * Move rich content out of `type_config` collections and into body blocks.
 * All-or-nothing per collection: if any entry needs a block, every entry in
 * that collection gets one, so the authored file never mixes two styles for
 * the same list of choices.
 */
function liftBlocks(typeConfig: Record<string, unknown>): { name: DirectiveName; id: string; content: string }[] {
  const blocks: { name: DirectiveName; id: string; content: string }[] = [];

  for (const [name, field] of Object.entries(DIRECTIVE_COLLECTIONS) as [DirectiveName, string][]) {
    const collection = typeConfig[field];
    if (!Array.isArray(collection)) continue;
    const entries = collection as Entry[];
    if (!entries.some((entry) => needsBlock(entry?.content))) continue;
    // Lifting is all-or-nothing per collection, so one entry that a block
    // cannot represent keeps the whole collection inline.
    if (entries.some((entry) => typeof entry?.content === "string" && entry.content.endsWith("\n"))) {
      continue;
    }

    for (const entry of entries) {
      if (typeof entry?.content !== "string" || typeof entry.id !== "string") continue;
      blocks.push({ name, id: entry.id, content: entry.content });
      delete entry.content;
    }
  }
  return blocks;
}

function diff(
  expected: unknown,
  actual: unknown,
  path: string,
  out: { path: string; expected: unknown; actual: unknown }[],
): void {
  if (expected === actual) return;
  const bothObjects =
    typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null;
  if (!bothObjects || Array.isArray(expected) !== Array.isArray(actual)) {
    out.push({ path, expected, actual });
    return;
  }
  const keys = new Set([
    ...Object.keys(expected as Record<string, unknown>),
    ...Object.keys(actual as Record<string, unknown>),
  ]);
  for (const key of keys) {
    diff(
      (expected as Record<string, unknown>)[key],
      (actual as Record<string, unknown>)[key],
      path === "" ? key : `${path}.${key}`,
      out,
    );
  }
}

/**
 * Render a canonical OQF question back into an authorable `.oes.md`
 * document.
 *
 * This direction is the one that can lose information, so by default it
 * verifies itself: the result is compiled back and compared field by field
 * against the input, and any difference throws {@link RoundTripError}
 * instead of returning. A caller therefore either gets a document that
 * provably compiles to what it started from, or gets an error — never a
 * quietly damaged file.
 */
export function decompileQuestion(question: OqfQuestion, options: DecompileOptions = {}): string {
  const source = structuredClone(question) as unknown as Record<string, unknown>;
  const version = (source.oqf_version as string | undefined) ?? DEFAULT_OQF_VERSION;
  const declaredSchema = source.$schema as string | undefined;
  const schemaIsCanonical = declaredSchema === canonicalSchemaUrl(version);

  const fields: Record<string, unknown> = { ...source };
  delete fields.id;
  delete fields.$schema;
  if (version === DEFAULT_OQF_VERSION) delete fields.oqf_version;
  // A non-canonical $schema is content the author chose; keeping it is the
  // difference between round-tripping and silently rewriting their URL.
  if (declaredSchema !== undefined && !schemaIsCanonical) fields.$schema = declaredSchema;

  const statement = fields.statement;
  let body: string;
  if (typeof statement === "object" && statement !== null && "file" in statement) {
    if (options.statementBody === undefined) {
      throw new RoundTripError(
        `statement is a file reference (${String((statement as { file: unknown }).file)}) — pass options.statementBody with that file's contents`,
        [],
      );
    }
    body = options.statementBody.replace(/\n+$/, "");
  } else {
    body = String(statement ?? "");
    delete fields.statement;
  }

  const blocks =
    typeof fields.type_config === "object" && fields.type_config !== null
      ? liftBlocks(fields.type_config as Record<string, unknown>)
      : [];

  const frontmatter = toYaml(orderAuthored(fields));
  const sections = blocks.length > 0 ? `\n\n${renderDirectives(blocks)}` : "";
  const document = `---\n${frontmatter}---\n\n${body}${sections}\n`;

  if (options.selfCheck !== false) {
    const compiled = compileQuestion(document, {
      id: question.id,
      oqfVersion: version,
      schemaBase: schemaIsCanonical ? DEFAULT_SCHEMA_BASE : null,
      validate: false,
    });
    const differences: { path: string; expected: unknown; actual: unknown }[] = [];
    diff(question, compiled.question, "", differences);

    const prose = compiled.files.find((file) => file.path !== "question.json");
    if (options.statementBody !== undefined && prose !== undefined) {
      // Compare against the normalised form, since that is what compiling
      // the authored document would have produced from the same bytes.
      diff(normalizeSource(options.statementBody), prose.content, "statement.file", differences);
    }
    if (differences.length > 0) {
      const summary = differences.map((entry) => `  ${entry.path || "<root>"}`).join("\n");
      throw new RoundTripError(
        `decompiled document does not compile back to its input — refusing to write.\nDiffering fields:\n${summary}`,
        differences,
      );
    }
  }

  return document;
}
