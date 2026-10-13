import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { SCHEMA_PATHS } from "../scripts/fetch-schemas.mjs";

// fetch-schemas.mjs decides which files land in vendor/; src/index.ts
// decides which of them are bundled. A path in one list but not the other
// is either fetched and never shipped, or imported and never fetched.
describe("schema list", () => {
  it("src/index.ts imports exactly the files fetch-schemas.mjs fetches", () => {
    const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const imported = [...index.matchAll(/from "\.\.\/vendor\/([^"]+)"/g)].map((m) => `schemas/${m[1]}`);
    expect(imported.sort()).toEqual([...(SCHEMA_PATHS as string[])].sort());
  });
});
