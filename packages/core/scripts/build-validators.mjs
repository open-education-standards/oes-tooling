#!/usr/bin/env node
// Compiles one ajv validator per document type into src/generated/validators.js
// using ajv's standalone code generation. ajv otherwise compiles validators at
// run time with `new Function`, which a host with a strict Content Security
// Policy (no `unsafe-eval`) refuses; the generated code needs no eval, only
// ajv's small runtime helpers and ajv-formats' format functions.
//
// Reads the schemas from the built @open-education-standards/schemas, so that package has to
// be built first (build-workspaces.mjs does that).
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";
import { schemas } from "@open-education-standards/schemas";

const OUT_DIR = new URL("../src/generated/", import.meta.url);
const OUT = fileURLToPath(new URL("validators.js", OUT_DIR));
const OUT_TYPES = fileURLToPath(new URL("validators.d.ts", OUT_DIR));

// The options validate.ts used when it compiled at run time, plus the
// standalone output mode.
const ajv = new Ajv({ strict: false, allErrors: true, code: { source: true, esm: true } });
addFormats(ajv);

// Export names must be identifiers, so "oaf.article" is exported as
// oaf_article and "opk.hub-package" as opk_hub_package.
const exportNameToDocType = {};
for (const [docType, entry] of Object.entries(schemas)) {
  const schema =
    "definition" in entry
      ? { definitions: entry.schema.definitions, $ref: `#/definitions/${entry.definition}` }
      : entry.schema;
  // addSchema with a key, not compile: standalone needs the schema registered.
  ajv.addSchema(schema, docType);
  exportNameToDocType[docType.replace(/\W/g, "_")] = docType;
}

let code = standaloneCode(ajv, exportNameToDocType);

// ajv emits `require()` for its runtime helper and the format functions even
// in ESM mode, which a bundler for a webview cannot rely on. Both are CommonJS
// modules, and Node, esbuild and Vite each decide differently what a default
// import of one is, so the import is a namespace and __pick walks down its
// `default` chain to the thing the generated code wants.
const HELPERS = {
  ucs2length: {
    from: "ajv/dist/runtime/ucs2length.js",
    expression: 'require("ajv/dist/runtime/ucs2length").default',
    pick: "__pick(__ns_ucs2length, (m) => typeof m === 'function')",
  },
  formats: {
    from: "ajv-formats/dist/formats.js",
    expression: 'require("ajv-formats/dist/formats").fullFormats',
    pick: "__pick(__ns_formats, (m) => m.fullFormats).fullFormats",
  },
};
const used = Object.entries(HELPERS).filter(([, helper]) => code.includes(helper.expression));
for (const [name, helper] of used) code = code.replaceAll(helper.expression, `__${name}`);
if (code.includes("require(")) throw new Error("Generated validators still call require()");
const preamble = [
  ...used.map(([name, helper]) => `import * as __ns_${name} from "${helper.from}";`),
  "const __pick = (ns, test) => {",
  "  for (let m = ns; m; m = m.default) if (test(m)) return m;",
  '  throw new Error("Cannot load a validator runtime helper");',
  "};",
  ...used.map(([name, helper]) => `const __${name} = ${helper.pick};`),
  "",
].join("\n");

const entries = Object.entries(exportNameToDocType);
const table = entries.map(([name, docType]) => `  ${JSON.stringify(docType)}: ${name},`).join("\n");
const docTypes = entries.map(([, docType]) => JSON.stringify(docType)).join(" | ");

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, `${preamble}${code}\nexport const validators = {\n${table}\n};\n`, "utf8");
await writeFile(
  OUT_TYPES,
  `import type { ValidateFunction } from "ajv";\n\nexport declare const validators: Record<${docTypes}, ValidateFunction>;\n`,
  "utf8",
);
console.log(`Wrote ${OUT}`);
