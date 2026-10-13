#!/usr/bin/env node
// Fetches the current schema JSON directly from the public spec repo
// (github.com/open-education-standards/oes) into vendor/, which src/index.ts then imports
// from exactly like a local file. This is what lets @inklyre/oes-schemas
// be built and published from this repo without oes needing any publish
// pipeline of its own — see this package's README.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The spec repo ref to read from. Defaults to main, which is what CI and
// the publish pipeline use. Override with OES_SPEC_REF when a schema
// change is still on a branch — otherwise this package cannot be built
// against it until that branch merges, which blocks the whole toolchain
// on a merge that the schema change itself is meant to justify.
const SPEC_REF = process.env.OES_SPEC_REF || "main";
const SPEC_REPO_RAW = `https://raw.githubusercontent.com/open-education-standards/oes/${SPEC_REF}`;
const VENDOR_ROOT = fileURLToPath(new URL("../vendor", import.meta.url));

// Kept in sync by hand with the spec repo's scripts/lib/current-schemas.mjs
// — the same set of files src/index.ts imports by name. Both halves are
// checked: checkAgainstSpec() below compares this list with the spec's,
// and test/schema-list.test.ts compares it with src/index.ts.
export const SCHEMA_PATHS = [
  "schemas/oaf/v0.2.0/article.schema.json",
  "schemas/ocf/v0.3.0/course.schema.json",
  "schemas/opf/v0.3.0/set.schema.json",
  "schemas/opk/v0.1.0/package.schema.json",
  "schemas/oqf/v0.2.0/question.schema.json",
  "schemas/oqf/v0.2.0/stimulus.schema.json",
  "schemas/orf/v0.1.0/resource.schema.json",
  "schemas/ovf/v0.1.0/video.schema.json",
];

async function fetchOne(relativePath) {
  const url = `${SPEC_REPO_RAW}/${relativePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  JSON.parse(body); // fail fast on a truncated/non-JSON response rather than writing garbage
  const dest = join(VENDOR_ROOT, relativePath.replace(/^schemas\//, ""));
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body, "utf8");
  return dest;
}

// The spec repo records which schema file is current per document type in
// scripts/lib/current-schemas.mjs. Without this check, a schema added to
// the spec (OPK 0.1.0 was) never reaches this package and nothing says
// so; a version bump forgotten here is caught too, by the same comparison.
async function checkAgainstSpec() {
  const url = `${SPEC_REPO_RAW}/scripts/lib/current-schemas.mjs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const specPaths = new Set(
    [...(await res.text()).matchAll(/"(schemas\/[^"]+\.schema\.json)"/g)].map((m) => m[1]),
  );
  const ours = new Set(SCHEMA_PATHS);
  const missing = [...specPaths].filter((p) => !ours.has(p));
  const extra = [...ours].filter((p) => !specPaths.has(p));
  if (missing.length || extra.length) {
    throw new Error(
      [
        `SCHEMA_PATHS is out of step with ${url}.`,
        ...missing.map((p) => `  missing (current in the spec): ${p}`),
        ...extra.map((p) => `  extra (not current in the spec): ${p}`),
        "Update SCHEMA_PATHS here and the imports in src/index.ts to match.",
      ].join("\n"),
    );
  }
}

async function main() {
  await checkAgainstSpec();
  const results = await Promise.all(SCHEMA_PATHS.map(fetchOne));
  for (const dest of results) console.log(`fetched: ${dest}`);
}

// Only run when executed, so the test suite can import SCHEMA_PATHS.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  });
}
