import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate, type DocumentType } from "../src/validate.js";

// Walks the conformance fixtures under test/fixtures/ (a copy of the spec
// repo's conformance/ — see fixtures/README.md), through @inklyre/oes-core's
// own validate() instead of a fresh ajv instance. This is what keeps the
// hand-written types and this package's validator honest against the real
// schemas — a schema change with no matching type update shows up here as
// a failing test, without needing full codegen.
const conformanceRoot = fileURLToPath(new URL("./fixtures", import.meta.url));

const SPEC_DOC_TYPES: Record<string, DocumentType | Record<string, DocumentType>> = {
  oaf: "oaf.article",
  ovf: "ovf.video",
  orf: "orf.resource",
  opf: "opf.set",
  opk: "opk.package",
  oqf: { question: "oqf.question", stimulus: "oqf.stimulus" },
  ocf: { course: "ocf.course", module: "ocf.module", lesson: "ocf.lesson" },
};

function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findJsonFiles(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

/** For a fixture under conformance/{spec}/{valid|invalid}/..., which DocumentType applies. */
function docTypeFor(spec: string, fixturePath: string): DocumentType {
  const mapping = SPEC_DOC_TYPES[spec];
  if (typeof mapping === "string") return mapping;
  const specRoot = join(conformanceRoot, spec);
  const relative = fixturePath.slice(specRoot.length + 1); // e.g. "valid/question/mcq.json"
  const subfolder = relative.split("/")[1]!; // "question" | "stimulus" | "course" | "module" | "lesson"
  const docType = mapping![subfolder];
  if (!docType) throw new Error(`No DocumentType mapping for ${spec}/${subfolder}`);
  return docType;
}

for (const spec of Object.keys(SPEC_DOC_TYPES)) {
  describe(`conformance/${spec}`, () => {
    const validDir = join(conformanceRoot, spec, "valid");
    const invalidDir = join(conformanceRoot, spec, "invalid");

    for (const file of findJsonFiles(validDir)) {
      it(`valid: ${file.slice(conformanceRoot.length + 1)}`, () => {
        const data = JSON.parse(readFileSync(file, "utf8"));
        const result = validate(docTypeFor(spec, file), data);
        expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
      });
    }

    for (const file of findJsonFiles(invalidDir)) {
      it(`invalid: ${file.slice(conformanceRoot.length + 1)}`, () => {
        const data = JSON.parse(readFileSync(file, "utf8"));
        const result = validate(docTypeFor(spec, file), data);
        expect(result.valid).toBe(false);
      });
    }
  });
}
