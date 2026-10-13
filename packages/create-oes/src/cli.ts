import { fsSource } from "@inklyre/oes-core";
import { lintCourse } from "@inklyre/oes-lint";
import { generateScaffold } from "./generate.js";

function printUsage(): void {
  console.error("Usage:");
  console.error(
    "  npm create oes [target-dir] [--id <id>] [--title <title>] [--author <name>]... " +
      "[--license <spdx>] [--force] [--json]",
  );
}

interface CliArgs {
  outDir: string;
  id?: string;
  title?: string;
  authors: string[];
  license?: string;
  force: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs | undefined {
  const parsed: CliArgs = { outDir: ".", authors: [], force: false, json: false };
  let outDirSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") parsed.id = argv[++i];
    else if (arg === "--title") parsed.title = argv[++i];
    else if (arg === "--author") parsed.authors.push(argv[++i]);
    else if (arg === "--license") parsed.license = argv[++i];
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") return undefined;
    else if (!outDirSet && !arg.startsWith("--")) {
      parsed.outDir = arg;
      outDirSet = true;
    } else return undefined;
  }
  return parsed;
}

function kebabCase(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "my-course";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const title = args.title ?? "My Course";
  const id = args.id ?? kebabCase(title);

  let result;
  try {
    result = await generateScaffold({
      outDir: args.outDir,
      id,
      title,
      authors: args.authors.length > 0 ? args.authors : undefined,
      license: args.license,
      force: args.force,
    });
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
    return;
  }

  // Confirm the generated tree has no dangling/duplicate-id issues — the
  // same check a hand-authored course gets from `oes lint`, not just that
  // each document individually passed schema validation during generation.
  const lint = await lintCourse(fsSource(result.outDir), "course.json");

  if (args.json) {
    console.log(JSON.stringify({ ...result, lint }, null, 2));
  } else {
    console.log(`Scaffolded ${result.files.length} file(s) into ${result.outDir}/`);
    if (lint.ok) {
      console.log("✓ Lint: no issues found");
    } else {
      console.log("Lint found issues:");
      for (const issue of lint.issues) {
        console.log(`  [${issue.rule}] ${issue.at}: ${issue.message}`);
      }
    }
    console.log("\nNext steps:");
    if (result.outDir !== ".") console.log(`  cd ${result.outDir}`);
    console.log("  Read https://open-education-standards.github.io/oes/specs/ocf/getting-started to see what each file does.");
    console.log("  Read https://open-education-standards.github.io/oes/editor-setup for inline validation/autocomplete in your editor.");
  }
  process.exitCode = lint.ok ? 0 : 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
