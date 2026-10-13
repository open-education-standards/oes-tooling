import { describe, expect, it } from "vitest";
import { schemas } from "../src/index.js";

describe("schemas", () => {
  it("every entry is a real JSON Schema object with an $id", () => {
    for (const [docType, entry] of Object.entries(schemas)) {
      expect(entry.schema, docType).toBeTypeOf("object");
      expect(entry.schema.$id, docType).toBeTypeOf("string");
    }
  });

  it("every entry with a definition points at a definitions key that actually exists in its schema", () => {
    for (const [docType, entry] of Object.entries(schemas)) {
      if (!("definition" in entry)) continue;
      const definitions = (entry.schema as { definitions?: Record<string, unknown> }).definitions;
      expect(definitions, docType).toBeTypeOf("object");
      expect(definitions?.[entry.definition], `${docType} -> definitions.${entry.definition}`).toBeDefined();
    }
  });
});
