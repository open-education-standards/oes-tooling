import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validate } from "@inklyre/oes-core";
import { afterEach, describe, expect, it } from "vitest";
import { buildHub, checkHub, compareSemver, namespaceProblem, parsePackageSource } from "../src/index.js";

const temps: string[] = [];
afterEach(async () => {
  while (temps.length) await rm(temps.pop()!, { recursive: true, force: true });
});

async function temp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

type Tree = Record<string, unknown>;

async function writeTree(root: string, tree: Tree): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  });

/** A git repository; each step writes files, commits, and tags. */
async function makeRepo(steps: Array<{ tag: string; files: Tree }>): Promise<string> {
  const repo = await temp("oes-hub-repo-");
  git(repo, "init", "-q", "-b", "main");
  for (const step of steps) {
    await writeTree(repo, step.files);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", step.tag, "--allow-empty");
    git(repo, "tag", step.tag);
  }
  return repo;
}

const mcq = (id: string, statement: string) => ({
  oqf_version: "0.2.0",
  id,
  type: "mcq",
  title: `Question ${id}`,
  statement,
  type_config: { options: [{ id: "a", content: "Yes" }, { id: "b", content: "No" }], answer: "a" },
});

/** A small practice-set package. */
function setPackage(name: string, version: string, extra: Tree = {}, title = "SQL drills"): Tree {
  return {
    "package.json": {
      opk_version: "0.2.0",
      name,
      version,
      title,
      description: "Short SQL questions.",
      tags: ["sql"],
      license: "CC-BY-4.0",
      entry: { type: "set", path: "set.json" },
    },
    "set.json": {
      opf_version: "0.3.0",
      id: "drills",
      title: "Drills",
      questions: [{ id: "q1", path: "questions/q1" }],
    },
    "questions/q1/question.json": mcq("q1", "Is this ![a table](table.png) normalised?"),
    "questions/q1/table.png": "PNG",
    "README.md": "Not part of the content, but part of the package.",
    ".github/workflows/ci.yml": "hidden files are not part of the package",
    ...extra,
  };
}

async function makeHub(sources: Record<string, string>, config: Record<string, unknown> = {}): Promise<string> {
  const hub = await temp("oes-hub-");
  await writeTree(hub, { "hub.json": { title: "Test Hub", namespace_rule: "any", ...config } });
  for (const [name, yaml] of Object.entries(sources)) await writeTree(hub, { [`packages/${name}.yml`]: yaml });
  return hub;
}

const opts = { today: "2026-10-13" };

async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  const walk = async (d: string, rel: string) => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p, `${rel}/${e.name}`);
      else h.update(`${rel}/${e.name}\0`).update(await readFile(p));
    }
  };
  await walk(dir, "");
  return h.digest("hex");
}

describe("buildHub", () => {
  it("publishes a tagged release and generates a site that matches the spec", async () => {
    const repo = await makeRepo([{ tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    const out = join(hub, "_site");

    const result = await buildHub(hub, { ...opts, out });
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.published).toEqual(["acme/sql-drills@1.0.0"]);

    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    expect(validate("opk.hub", index).valid).toBe(true);
    expect(index.packages).toEqual([
      {
        name: "acme/sql-drills",
        title: "SQL drills",
        description: "Short SQL questions.",
        entry_type: "set",
        tags: ["sql"],
        latest: "1.0.0",
        url: "packages/acme/sql-drills.json",
      },
    ]);

    const doc = JSON.parse(await readFile(join(out, index.packages[0].url), "utf8"));
    expect(validate("opk.hub-package", doc).valid).toBe(true);
    const v = doc.versions[0];
    expect(v).toMatchObject({ version: "1.0.0", published_at: "2026-10-13", files: "sql-drills/1.0.0/files/" });

    // Every URL resolves relative to the document that contains it.
    const docDir = join(out, "packages/acme");
    const bundleText = await readFile(join(docDir, v.bundle), "utf8");
    expect(`sha256-${createHash("sha256").update(bundleText).digest("hex")}`).toBe(v.bundle_sha256);
    const manifest = JSON.parse(await readFile(join(docDir, v.manifest), "utf8"));
    expect(manifest.digest).toBe(v.digest);
    expect(validate("opk.package", manifest).valid).toBe(true);

    // The package's files: hidden files and package.json excluded, everything else in.
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(["README.md", "questions/q1/question.json", "questions/q1/table.png", "set.json"]);
    // The digest is what the spec's sha256sum one-liner computes over the served files.
    const shell = execFileSync("sh", ["-c", "find . -type f -printf '%P\\0' | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum"], {
      cwd: join(docDir, v.files),
      encoding: "utf8",
    }).split(" ")[0];
    expect(manifest.digest).toBe(`sha256-${shell}`);

    // The bundle's relative URLs resolve to served files.
    const bundle = JSON.parse(bundleText);
    expect(bundle.documents["question:q1"].statement).toBe("Is this ![a table](files/questions/q1/table.png) normalised?");
    expect(existsSync(join(docDir, "sql-drills/1.0.0", bundle.assets[0].url))).toBe(true);

    const html = await readFile(join(out, "packages/acme/sql-drills/index.html"), "utf8");
    expect(html).toContain("SQL drills");
    expect(html).toContain("Question q1");
    expect(await readFile(join(out, "index.html"), "utf8")).toContain('href="packages/acme/sql-drills/"');
  });

  it("never changes a published version", async () => {
    const repo = await makeRepo([{ tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    await buildHub(hub, opts);
    const before = await treeHash(join(hub, "store"));

    // Rebuilding publishes nothing.
    const again = await buildHub(hub, opts);
    expect(again.ok).toBe(true);
    expect(again.published).toEqual([]);

    // Moving the tag to different content changes nothing either: the store is the record.
    await writeTree(repo, { "set.json": { opf_version: "0.3.0", id: "drills", title: "Changed", questions: [{ id: "q1", path: "questions/q1" }] } });
    git(repo, "commit", "-qam", "change");
    git(repo, "tag", "-f", "v1.0.0");
    const moved = await buildHub(hub, opts);
    expect(moved.ok).toBe(true);
    expect(moved.published).toEqual([]);
    expect(await treeHash(join(hub, "store"))).toBe(before);
  });

  it("refuses to publish an existing version number from a new tag", async () => {
    const repo = await makeRepo([
      { tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") },
      { tag: "v1.0.0-again", files: { "README.md": "edited, but the version wasn't bumped" } },
    ]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n  - tag: v1.0.0-again\n` });
    const result = await buildHub(hub, opts);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message).join("\n")).toContain("version 1.0.0 is already published");
  });

  it("yanks versions without deleting them", async () => {
    const repo = await makeRepo([
      { tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") },
      { tag: "v1.1.0", files: setPackage("acme/sql-drills", "1.1.0") },
    ]);
    const source = (yank: string) =>
      `source: ${repo}\nversions:\n  - tag: v1.0.0\n  - tag: v1.1.0\n${yank}`;
    const hub = await makeHub({ "acme/sql-drills": source("    yanked: Wrong answer in q1.\n") });
    const out = join(hub, "_site");
    await buildHub(hub, { ...opts, out });

    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8"));
    expect(index.packages[0].latest).toBe("1.0.0");
    const doc = JSON.parse(await readFile(join(out, "packages/acme/sql-drills.json"), "utf8"));
    expect(doc.versions.map((v: { version: string }) => v.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(doc.versions[0]).toMatchObject({ yanked: true, yanked_reason: "Wrong answer in q1." });
    expect(existsSync(join(out, "packages/acme/sql-drills/1.1.0/bundle.json"))).toBe(true);

    // With every version yanked, the package leaves the index but stays fetchable.
    await writeFile(join(hub, "packages/acme/sql-drills.yml"), `source: ${repo}\nversions:\n  - tag: v1.0.0\n    yanked: true\n  - tag: v1.1.0\n    yanked: true\n`);
    await buildHub(hub, { ...opts, out });
    expect(JSON.parse(await readFile(join(out, "index.json"), "utf8")).packages).toEqual([]);
    expect(existsSync(join(out, "packages/acme/sql-drills.json"))).toBe(true);
  });

  it("detects a store that was edited by hand", async () => {
    const repo = await makeRepo([{ tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    await buildHub(hub, opts);
    await writeFile(join(hub, "store/acme/sql-drills/1.0.0/files/set.json"), "{}");
    const result = await checkHub(hub, opts);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message).join("\n")).toContain("files/set.json does not match its manifest entry");
  });

  it("rejects invalid content and publishes nothing", async () => {
    const broken = setPackage("acme/sql-drills", "1.0.0", {
      "set.json": { opf_version: "0.3.0", id: "drills", title: "Drills", questions: [{ id: "q1", path: "questions/missing" }] },
    });
    const repo = await makeRepo([{ tag: "v1.0.0", files: broken }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    const result = await buildHub(hub, { ...opts, out: join(hub, "_site") });
    expect(result.ok).toBe(false);
    expect(existsSync(join(hub, "store"))).toBe(false);
    expect(existsSync(join(hub, "_site"))).toBe(false);
  });

  it("requires the manifest name to match the source file", async () => {
    const repo = await makeRepo([{ tag: "v1.0.0", files: setPackage("someone-else/sql-drills", "1.0.0") }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    const result = await checkHub(hub, opts);
    expect(result.issues.map((i) => i.message).join("\n")).toContain('names "someone-else/sql-drills"');
  });

  it("escapes package text in the browse pages", async () => {
    const files = setPackage("acme/sql-drills", "1.0.0", {}, '<script>alert("x")</script>');
    const repo = await makeRepo([{ tag: "v1.0.0", files }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    const out = join(hub, "_site");
    await buildHub(hub, { ...opts, out });
    for (const page of ["index.html", "packages/acme/sql-drills/index.html"]) {
      const html = await readFile(join(out, page), "utf8");
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    }
  });

  it("check reports what build would publish, and writes nothing", async () => {
    const repo = await makeRepo([{ tag: "v1.0.0", files: setPackage("acme/sql-drills", "1.0.0") }]);
    const hub = await makeHub({ "acme/sql-drills": `source: ${repo}\nversions:\n  - tag: v1.0.0\n` });
    const result = await checkHub(hub, opts);
    expect(result.ok).toBe(true);
    expect(result.published).toEqual(["acme/sql-drills@1.0.0"]);
    expect(existsSync(join(hub, "store"))).toBe(false);
  });
});

describe("namespace rule", () => {
  const config = { title: "Hub", namespace_rule: "github-owner" as const };
  const src = (name: string, source: string) => ({ name, file: `packages/${name}.yml`, source, path: "", versions: [{ tag: "v1" }] });

  it("accepts a namespace equal to the repository's GitHub owner, case-insensitively", () => {
    expect(namespaceProblem(config, src("acme/x", "https://github.com/Acme/x"))).toBeUndefined();
    expect(namespaceProblem(config, src("acme/x", "https://github.com/acme/x.git"))).toBeUndefined();
  });
  it("rejects someone else's namespace, and non-GitHub sources", () => {
    expect(namespaceProblem(config, src("acme/x", "https://github.com/mallory/x"))).toContain('must equal the source repository\'s GitHub owner, "mallory"');
    expect(namespaceProblem(config, src("acme/x", "https://gitlab.com/acme/x"))).toContain("https://github.com/");
  });
  it("can be turned off", () => {
    expect(namespaceProblem({ ...config, namespace_rule: "any" }, src("acme/x", "https://gitlab.com/acme/x"))).toBeUndefined();
  });
});

describe("package source files", () => {
  it("rejects malformed sources", () => {
    expect(() => parsePackageSource("a/b", "f.yml", "source: x\nversions: []\n")).toThrow("at least one");
    expect(() => parsePackageSource("a/b", "f.yml", "source: x\nversions:\n  - tag: v1\n  - tag: v1\n")).toThrow("listed twice");
    expect(() => parsePackageSource("a/b", "f.yml", "source: x\npath: ../other\nversions:\n  - tag: v1\n")).toThrow("inside the repository");
  });
  it("normalises the package path", () => {
    expect(parsePackageSource("a/b", "f.yml", "source: x\npath: ./sub/dir/\nversions:\n  - tag: v1\n").path).toBe("sub/dir");
  });
});

describe("compareSemver", () => {
  it("orders by SemVer precedence", () => {
    const sorted = ["1.0.0", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta", "1.0.0-alpha.beta", "1.0.0-rc.1", "0.9.9", "1.10.0", "1.2.0", "1.0.0-beta.11", "1.0.0-beta.2"]
      .sort(compareSemver);
    expect(sorted).toEqual(["0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.2.0", "1.10.0"]);
  });
});
