import { build } from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { validate } from "../src/validate.js";

// A host with a strict Content Security Policy (no `unsafe-eval`) cannot run
// ajv's compiler, which builds validators with `new Function`. The validators
// are generated at build time instead; this bundles the package together with
// every runtime import it pulls in (the ajv helpers, the format functions)
// and fails if anything that evaluates code is still reachable.
describe("no run-time code evaluation", () => {
  it("the bundled package and its runtime imports never call eval or new Function", async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      mainFields: ["module", "main"],
      logLevel: "silent",
    });
    const code = result.outputFiles.map((file) => file.text).join("\n");
    expect(code).not.toMatch(/new\s+Function\s*\(/);
    expect(code).not.toMatch(/(?<![\w.$])eval\s*\(/);
    expect(code).not.toMatch(/ajv\/dist\/(?:compile|core|ajv)\b/);
  });

  it("still validates and reports errors in ajv's shape", () => {
    const result = validate("oaf.article", { oaf_version: "0.2.0", id: "Not Kebab" });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.errors?.[0]).toHaveProperty("instancePath");
    expect(result.errors?.[0]).toHaveProperty("keyword");
  });
});

// The scan above can miss a path it does not recognise, so this runs the
// bundled package in a context where eval and Function(...) throw, and calls
// every document type's validator in it.
describe("validators run with code generation from strings disabled", () => {
  const VALID_FIXTURES: Record<string, string> = {
    "oaf.article": "oaf/valid/article.json",
    "ovf.video": "ovf/valid/streaming-only.json",
    "orf.resource": "orf/valid/basic.json",
    "oqf.question": "oqf/valid/question/essay.json",
    "oqf.stimulus": "oqf/valid/stimulus/",
    "opf.set": "opf/valid/co-located.json",
    "opk.package": "opk/valid/package/minimal.json",
    "opk.hub": "opk/valid/hub/empty.json",
    "opk.hub-package": "opk/valid/hub-package/single-version.json",
    "ocf.course": "ocf/valid/course/basic.json",
    "ocf.module": "ocf/valid/module/basic.json",
    "ocf.lesson": "ocf/valid/lesson/full.json",
  };

  it("validates a valid and an invalid document of every type", async () => {
    const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "cjs",
      platform: "node",
      logLevel: "silent",
    });
    const sandbox = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    const module = { exports: {} as { validate?: (docType: string, data: unknown) => { valid: boolean } } };
    const load = vm.runInContext(
      `(function (module, exports, require) {${result.outputFiles[0].text}\n})`,
      sandbox,
    ) as (m: unknown, e: unknown, r: NodeRequire) => void;
    load(module, module.exports, createRequire(import.meta.url));
    const { validate: sandboxed } = module.exports;
    expect(sandboxed).toBeTypeOf("function");

    // Proves the sandbox does what this test relies on.
    expect(() => vm.runInContext("new Function('return 1')", sandbox)).toThrow();

    for (const [docType, file] of Object.entries(VALID_FIXTURES)) {
      const path = fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));
      const doc = file.endsWith("/") ? readdirJson(path) : JSON.parse(readFileSync(path, "utf8"));
      expect(sandboxed!(docType, doc).valid, `${docType} valid`).toBe(true);
      expect(sandboxed!(docType, {}).valid, `${docType} invalid`).toBe(false);
    }
  });
});

function readdirJson(dir: string): unknown {
  const [first] = readdirSync(dir).filter((name) => name.endsWith(".json"));
  return JSON.parse(readFileSync(join(dir, first), "utf8"));
}
