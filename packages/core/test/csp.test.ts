import { build } from "esbuild";
import { fileURLToPath } from "node:url";
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
