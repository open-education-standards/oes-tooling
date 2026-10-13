import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { compileQuestion } from "./compile.js";
import { decompileQuestion } from "./decompile.js";
import type { CompileOptions } from "./types.js";

/** The extension that marks an authored question. */
export const AUTHORED_EXT = ".oes.md";

/** Conventional folder for authored sources kept beside their compiled output. */
export const AUTHORED_DIR = "authored";

export interface CompileFileResult {
  /** Files written, as paths relative to the process's working directory. */
  written: string[];
  /** Files whose content was already correct — only populated in check mode. */
  unchanged: string[];
  questionId: string;
}

/**
 * Where a `.oes.md` file's compiled output belongs, and what `id` it gets.
 *
 * By convention an authored source sits in an `authored/` folder beside its
 * compiled form, so `questions/binary-search/authored/question.oes.md`
 * compiles into `questions/binary-search/` with id `binary-search`. A file
 * anywhere else compiles into its own folder and takes that folder's name.
 */
export function resolveTarget(file: string): { outDir: string; id: string } {
  const dir = dirname(resolve(file));
  const outDir = basename(dir) === AUTHORED_DIR ? dirname(dir) : dir;
  return { outDir, id: basename(outDir) };
}

async function writeIfChanged(path: string, content: string, check: boolean): Promise<boolean> {
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing === content) return false;
  if (!check) await writeFile(path, content, "utf8");
  return true;
}

/**
 * Compile one `.oes.md` file, writing `question.json` (and a prose file, if
 * the frontmatter asked for one) into its target folder.
 *
 * In `check` mode nothing is written; the result reports what would have
 * changed, which is what a CI job wants in order to fail on stale output.
 */
export async function compileFile(
  file: string,
  options: CompileOptions & { check?: boolean } = {},
): Promise<CompileFileResult> {
  const { outDir, id } = resolveTarget(file);
  const source = await readFile(file, "utf8");
  const { question, files } = compileQuestion(source, { id, ...options });

  const written: string[] = [];
  const unchanged: string[] = [];
  for (const emitted of files) {
    const target = join(outDir, emitted.path);
    const changed = await writeIfChanged(target, emitted.content, options.check === true);
    (changed ? written : unchanged).push(relative(process.cwd(), target));
  }
  return { written, unchanged, questionId: question.id };
}

/**
 * Decompile a `question.json` into `authored/question.oes.md` beside it,
 * reading the prose file when the statement lives in one.
 */
export async function decompileFile(
  file: string,
  options: { check?: boolean } = {},
): Promise<{ written: string[]; unchanged: string[] }> {
  const dir = dirname(resolve(file));
  const question = JSON.parse(await readFile(file, "utf8"));

  const statement = question.statement;
  const statementBody =
    statement && typeof statement === "object" && typeof statement.file === "string"
      ? await readFile(join(dir, statement.file), "utf8")
      : undefined;

  const document = decompileQuestion(question, { statementBody });
  const target = join(dir, AUTHORED_DIR, "question.oes.md");

  if (options.check !== true) {
    await readdir(join(dir, AUTHORED_DIR)).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(dir, AUTHORED_DIR), { recursive: true });
    });
  }
  const changed = await writeIfChanged(target, document, options.check === true);
  const path = relative(process.cwd(), target);
  return changed ? { written: [path], unchanged: [] } : { written: [], unchanged: [path] };
}

/** Recursively collect every file matching `predicate` under `dir`. */
async function walk(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, predicate)));
    else if (predicate(entry.name)) found.push(path);
  }
  return found.sort();
}

export const findAuthored = (dir: string): Promise<string[]> =>
  walk(dir, (name) => name.endsWith(AUTHORED_EXT));

export const findQuestions = (dir: string): Promise<string[]> =>
  walk(dir, (name) => name === "question.json");
