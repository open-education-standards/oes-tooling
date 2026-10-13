import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fsSource } from "@inklyre/oes-core";
import {
  AUTHORED_EXT,
  compileFile,
  decompileFile,
  findAuthored,
  findQuestions,
} from "@inklyre/oes-authoring";
import {
  fetchYoutubePlaylist,
  generateFromPlan,
  parsePlan,
  planYoutubeImport,
  serializePlan,
  YoutubeApiError,
  type ImportPlan,
} from "@inklyre/oes-import-youtube";
import type { LintResult } from "./types.js";
import { lintCourse, lintLesson, lintModule, lintSet } from "./index.js";

const ENTRY_FILES = ["course.json", "set.json", "module.json", "lesson.json"] as const;
type EntryFile = (typeof ENTRY_FILES)[number];

function isEntryFile(value: string): value is EntryFile {
  return (ENTRY_FILES as readonly string[]).includes(value);
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  oes lint <path> [--entry course.json|set.json|module.json|lesson.json] [--json]");
  console.error("  oes compile <file.oes.md|dir> [--check] [--json]");
  console.error("  oes decompile <question.json|dir> [--check] [--json]");
  console.error("  oes import youtube <playlist-url> [--api-key <key>] [--out <dir>] [--plan <file>] [--json]");
  console.error("  oes import youtube --from-plan <file> [--out <dir>] [--force] [--json]");
}

function detectEntry(dir: string): EntryFile | undefined {
  return ENTRY_FILES.find((file) => existsSync(join(dir, file)));
}

function runLint(entry: EntryFile, source: ReturnType<typeof fsSource>): Promise<LintResult> {
  switch (entry) {
    case "course.json":
      return lintCourse(source, entry);
    case "set.json":
      return lintSet(source, entry);
    case "module.json":
      return lintModule(source, entry);
    case "lesson.json":
      return lintLesson(source, entry);
  }
}

function printHuman(dir: string, entry: EntryFile, result: LintResult): void {
  if (result.issues.length === 0) {
    console.log(`✓ ${dir} (${entry}) — no issues found`);
    return;
  }
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "error" : "warn ";
    console.log(`${tag}  [${issue.rule}] ${issue.at}: ${issue.message}`);
  }
  const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
  const warningCount = result.issues.length - errorCount;
  console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
}

async function runLintCommand(args: string[]): Promise<void> {
  let dir: string | undefined;
  let entryArg: string | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--entry") {
      entryArg = args[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (dir === undefined) {
      dir = arg;
    } else {
      printUsage();
      process.exitCode = 1;
      return;
    }
  }

  if (dir === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (entryArg !== undefined && !isEntryFile(entryArg)) {
    console.error(`--entry must be one of: ${ENTRY_FILES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const entry = entryArg ?? detectEntry(dir);
  if (entry === undefined) {
    console.error(`No ${ENTRY_FILES.join(", ")} found in ${dir}`);
    process.exitCode = 1;
    return;
  }

  const result = await runLint(entry, fsSource(dir));

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(dir, entry, result);
  }
  process.exitCode = result.ok ? 0 : 1;
}

interface TransformArgs {
  path?: string;
  check: boolean;
  json: boolean;
}

function parseTransformArgs(args: string[]): TransformArgs | undefined {
  const parsed: TransformArgs = { check: false, json: false };
  for (const arg of args) {
    if (arg === "--check") parsed.check = true;
    else if (arg === "--json") parsed.json = true;
    else if (parsed.path === undefined && !arg.startsWith("--")) parsed.path = arg;
    else return undefined;
  }
  return parsed.path === undefined ? undefined : parsed;
}

/**
 * `compile` and `decompile` are the same shape — expand a path to a list of
 * files, run one transform over each, and report what changed — so they
 * share a driver and differ only in how they find files and what they do
 * with one.
 */
async function runTransform(
  args: string[],
  verb: "compile" | "decompile",
  find: (dir: string) => Promise<string[]>,
  transform: (file: string, options: { check: boolean }) => Promise<{ written: string[]; unchanged: string[] }>,
): Promise<void> {
  const parsed = parseTransformArgs(args);
  if (!parsed || parsed.path === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  let files: string[];
  try {
    files = statSync(parsed.path).isDirectory() ? await find(parsed.path) : [parsed.path];
  } catch {
    console.error(`No such file or directory: ${parsed.path}`);
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    const what = verb === "compile" ? `*${AUTHORED_EXT} files` : "question.json files";
    console.error(`No ${what} found under ${parsed.path}`);
    process.exitCode = 1;
    return;
  }

  const written: string[] = [];
  const unchanged: string[] = [];
  const failed: { file: string; message: string }[] = [];

  for (const file of files) {
    try {
      const result = await transform(file, { check: parsed.check });
      written.push(...result.written);
      unchanged.push(...result.unchanged);
    } catch (cause) {
      failed.push({ file, message: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  const ok = failed.length === 0 && (!parsed.check || written.length === 0);

  if (parsed.json) {
    console.log(JSON.stringify({ ok, written, unchanged, failed }, null, 2));
  } else {
    for (const failure of failed) {
      console.error(`error  ${failure.file}: ${failure.message}`);
    }
    if (parsed.check) {
      for (const path of written) console.log(`stale  ${path}`);
      if (ok) console.log(`✓ ${unchanged.length} file(s) up to date`);
      else if (failed.length === 0) console.log(`\n${written.length} file(s) would change — re-run without --check`);
    } else {
      for (const path of written) console.log(`wrote  ${path}`);
      if (failed.length === 0) {
        console.log(`\n${written.length} written, ${unchanged.length} unchanged`);
      }
    }
  }
  process.exitCode = ok ? 0 : 1;
}

interface ImportYoutubeArgs {
  playlist?: string;
  apiKey?: string;
  out?: string;
  planPath?: string;
  fromPlanPath?: string;
  force: boolean;
  json: boolean;
}

function parseImportYoutubeArgs(args: string[]): ImportYoutubeArgs | undefined {
  const parsed: ImportYoutubeArgs = { force: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--api-key") parsed.apiKey = args[++i];
    else if (arg === "--out") parsed.out = args[++i];
    else if (arg === "--plan") parsed.planPath = args[++i];
    else if (arg === "--from-plan") parsed.fromPlanPath = args[++i];
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--json") parsed.json = true;
    else if (parsed.playlist === undefined && !arg.startsWith("--")) parsed.playlist = arg;
    else return undefined;
  }
  return parsed;
}

async function resolvePlan(args: ImportYoutubeArgs): Promise<ImportPlan | undefined> {
  if (args.fromPlanPath) {
    return parsePlan(await readFile(args.fromPlanPath, "utf8"));
  }

  const apiKey = args.apiKey ?? process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("A YouTube Data API key is required: pass --api-key <key> or set the YOUTUBE_API_KEY environment variable.");
    process.exitCode = 1;
    return undefined;
  }
  if (!args.playlist) {
    printUsage();
    process.exitCode = 1;
    return undefined;
  }

  try {
    const playlist = await fetchYoutubePlaylist(args.playlist, apiKey);
    return await planYoutubeImport(playlist);
  } catch (cause) {
    if (cause instanceof YoutubeApiError) {
      console.error(`YouTube API error (${cause.status}): ${cause.message}`);
    } else {
      console.error(cause instanceof Error ? cause.message : String(cause));
    }
    process.exitCode = 1;
    return undefined;
  }
}

async function runImportYoutubeCommand(args: string[]): Promise<void> {
  const parsed = parseImportYoutubeArgs(args);
  if (!parsed) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (parsed.fromPlanPath && parsed.playlist) {
    console.error("Pass either a playlist URL or --from-plan <file>, not both.");
    process.exitCode = 1;
    return;
  }
  if (parsed.fromPlanPath && parsed.planPath) {
    console.error("--plan and --from-plan can't be combined — --from-plan already skips fetching a fresh plan.");
    process.exitCode = 1;
    return;
  }
  if (!parsed.fromPlanPath && !parsed.playlist) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const plan = await resolvePlan(parsed);
  if (!plan) return; // resolvePlan already reported the error and set exitCode.

  if (parsed.planPath) {
    await writeFile(parsed.planPath, serializePlan(plan), "utf8");
    if (parsed.json) {
      console.log(
        JSON.stringify(
          { plan_written: parsed.planPath, module_id: plan.module.id, lesson_count: plan.module.lessons.length },
          null,
          2,
        ),
      );
    } else {
      console.log(`Wrote plan (${plan.module.lessons.length} lesson(s)) to ${parsed.planPath}.`);
      console.log("Review/edit it (retitle a lesson, reorder or drop entries), then run:");
      console.log(`  oes import youtube --from-plan ${parsed.planPath}`);
    }
    return;
  }

  const outDir = parsed.out ?? plan.module.id;
  let generated;
  try {
    generated = await generateFromPlan(plan, outDir, { force: parsed.force });
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
    return;
  }

  // Confirm the generated tree has no dangling/duplicate-id issues, the
  // same check a hand-authored course gets from `oes lint` — not just that
  // each document individually passed schema validation during generation.
  const lint = await lintModule(fsSource(outDir), "module.json");

  if (parsed.json) {
    console.log(JSON.stringify({ ...generated, lint }, null, 2));
  } else {
    console.log(`Generated ${generated.lessonCount} lesson(s) into ${generated.outDir}/`);
    if (lint.ok) {
      console.log("✓ Lint: no issues found");
    } else {
      console.log("Lint found issues:");
      for (const issue of lint.issues) {
        console.log(`  [${issue.rule}] ${issue.at}: ${issue.message}`);
      }
    }
  }
  process.exitCode = lint.ok ? 0 : 1;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "lint") {
    await runLintCommand(rest);
    return;
  }
  if (command === "compile") {
    await runTransform(rest, "compile", findAuthored, (file, options) =>
      compileFile(file, options).then(({ written, unchanged }) => ({ written, unchanged })),
    );
    return;
  }
  if (command === "decompile") {
    await runTransform(rest, "decompile", findQuestions, decompileFile);
    return;
  }
  if (command === "import" && rest[0] === "youtube") {
    await runImportYoutubeCommand(rest.slice(1));
    return;
  }
  printUsage();
  process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
