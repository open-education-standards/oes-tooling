import { validateOqfQuestion, type OqfQuestion } from "@inklyre/oes-core";
import { DIRECTIVE_COLLECTIONS, extractDirectives, type DirectiveBlock } from "./directives.js";
import { parseFrontmatter, splitDocument } from "./frontmatter.js";
import {
  AuthoringError,
  DEFAULT_OQF_VERSION,
  DEFAULT_SCHEMA_BASE,
  type CompileOptions,
  type CompileResult,
} from "./types.js";

/**
 * Output key order, taken from the OQF schema's own `properties` order so
 * the compiler and the spec can't drift. Ordering carries no meaning in
 * JSON, but fixing it makes compiled output byte-stable — which is what
 * lets a generated `question.json` sit in git without churning.
 */
const KEY_ORDER = [
  "$schema",
  "oqf_version",
  "id",
  "authors",
  "license",
  "type",
  "title",
  "difficulty",
  "status",
  "tags",
  "topics",
  "companies",
  "time_limit_mins",
  "max_attempts",
  "hints",
  "explanation",
  "references",
  "source",
  "type_config",
  "statement",
  "stimulus",
  "answer_key",
] as const;

function schemaUrl(base: string, version: string): string {
  const major = version.split(".").slice(0, 2).join(".");
  return `${base.replace(/\/$/, "")}/oqf/v${major}.0/question.schema.json`;
}

function orderKeys(doc: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (key in doc) ordered[key] = doc[key];
  }
  // Anything the schema doesn't name — extension fields (`x_*`) and fields
  // added by a newer spec version than this build knows — keeps its
  // authored order at the end rather than being dropped.
  for (const [key, value] of Object.entries(doc)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

interface CollectionEntry {
  id?: unknown;
  content?: unknown;
}

/** Merge each directive block's Markdown into the matching `type_config` entry. */
function applyDirectives(typeConfig: Record<string, unknown>, blocks: DirectiveBlock[]): void {
  for (const block of blocks) {
    const field = DIRECTIVE_COLLECTIONS[block.name];
    const collection = typeConfig[field];
    if (!Array.isArray(collection)) {
      throw new AuthoringError(
        `:::${block.name} needs a 'type_config.${field}' list in frontmatter, but there is none`,
        block.line,
      );
    }
    const entry = (collection as CollectionEntry[]).find((candidate) => candidate?.id === block.id);
    if (!entry) {
      throw new AuthoringError(
        `:::${block.name}{id=${block.id}} has no matching entry in type_config.${field}`,
        block.line,
      );
    }
    if (entry.content !== undefined) {
      throw new AuthoringError(
        `'${block.id}' has content in both frontmatter and a :::${block.name} block — use one or the other`,
        block.line,
      );
    }
    entry.content = block.content;
  }
}

/**
 * Compile a `.oes.md` document into a canonical OQF question.
 *
 * The body becomes the statement. If frontmatter declares
 * `statement: {file: "…"}` the body is emitted as that file instead of
 * being inlined — the author decides, and the compiler never guesses from
 * length. Everything else in frontmatter is copied through unchanged:
 * frontmatter uses OQF's own field names, so this is a serializer rather
 * than a translator, and a field added to the spec works here without a
 * change to this package.
 */
export function compileQuestion(source: string, options: CompileOptions = {}): CompileResult {
  const { frontmatter, body } = splitDocument(source);
  const fields = parseFrontmatter(frontmatter);
  const { statement, blocks } = extractDirectives(body);

  const id = (fields.id as string | undefined) ?? options.id;
  if (id === undefined) {
    throw new AuthoringError(
      "no 'id' in frontmatter and no fallback supplied — pass the question's folder name as options.id",
    );
  }

  const version = (fields.oqf_version as string | undefined) ?? options.oqfVersion ?? DEFAULT_OQF_VERSION;
  const base = options.schemaBase === undefined ? DEFAULT_SCHEMA_BASE : options.schemaBase;

  const doc: Record<string, unknown> = { ...fields, oqf_version: version, id };
  if (base !== null) doc.$schema = fields.$schema ?? schemaUrl(base, version);

  if (blocks.length > 0) {
    if (typeof doc.type_config !== "object" || doc.type_config === null || Array.isArray(doc.type_config)) {
      throw new AuthoringError("the body has :::option blocks but frontmatter has no 'type_config'");
    }
    applyDirectives(doc.type_config as Record<string, unknown>, blocks);
  }

  const files: CompileResult["files"] = [];
  const declared = fields.statement;
  const prose = statement.replace(/^\n+/, "").replace(/\n+$/, "");

  if (typeof declared === "object" && declared !== null && "file" in declared) {
    const file = (declared as { file: unknown }).file;
    if (typeof file !== "string" || file.length === 0) {
      throw new AuthoringError("statement.file must be a non-empty path relative to the question folder");
    }
    files.push({ path: file, content: `${prose}\n` });
  } else if (declared !== undefined) {
    throw new AuthoringError(
      "'statement' in frontmatter must be {file: …}; an inline statement is written as the document body instead",
    );
  } else {
    if (prose.length === 0) {
      throw new AuthoringError("the document body is empty — it is the question's statement");
    }
    doc.statement = prose;
  }

  const question = orderKeys(doc);

  if (options.validate !== false) {
    const result = validateOqfQuestion(question);
    if (!result.valid) {
      const detail = (result.errors ?? [])
        .map((error) => `  ${error.instancePath || "/"} ${error.message}`)
        .join("\n");
      throw new AuthoringError(`compiled question does not satisfy the OQF schema:\n${detail}`);
    }
  }

  files.unshift({ path: "question.json", content: `${JSON.stringify(question, null, 2)}\n` });
  return { question: question as unknown as OqfQuestion, files };
}
