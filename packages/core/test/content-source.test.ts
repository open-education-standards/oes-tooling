import { afterEach, describe, expect, it, vi } from "vitest";
import { urlSource } from "../src/content-source.js";

describe("urlSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches an absolute URL and re-roots the returned source at its directory", async () => {
    const responses: Record<string, unknown> = {
      "https://example.com/course/course.json": { title: "Root" },
      "https://example.com/course/modules/m1/module.json": { title: "Child" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = responses[url];
        if (!body) throw new Error(`unexpected fetch: ${url}`);
        return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) } as Response;
      })
    );

    const root = urlSource("https://example.com/course/course.json");
    const { data, source } = await root.fetch("https://example.com/course/course.json");
    expect(data).toEqual({ title: "Root" });

    // A relative fetch from the re-rooted source resolves against course.json's own directory.
    const child = await source.fetch("modules/m1/module.json");
    expect(child.data).toEqual({ title: "Child" });
  });

  it("throws a descriptive error on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" }) as Response)
    );

    await expect(urlSource("https://example.com/").fetch("missing.json")).rejects.toThrow(/404/);
  });
});
