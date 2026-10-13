import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundlePackage, fsSource, packageDigest, type OpkPackage } from "../src/index.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

type Tree = Record<string, unknown>;

/** Write `tree` (path → JSON object or string) into a fresh temp directory. */
async function makePackage(tree: Tree): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oes-bundle-"));
  dirs.push(root);
  for (const [path, content] of Object.entries(tree)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

async function fileIndex(root: string, tree: Tree) {
  const index = new Map<string, { sha256: string; bytes: number }>();
  for (const path of Object.keys(tree)) {
    const bytes = await readFile(join(root, path));
    index.set(path, { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  }
  return index;
}

const manifest: OpkPackage = {
  opk_version: "0.2.0",
  name: "acme/intro",
  version: "1.0.0",
  title: "Intro",
  entry: { type: "course", path: "course.json" },
  digest: "sha256-" + "0".repeat(64),
};

const mcq = (id: string, extra: Record<string, unknown> = {}) => ({
  oqf_version: "0.2.0",
  id,
  type: "mcq",
  title: id,
  statement: `Question ${id}`,
  type_config: { options: [{ id: "a", content: "Yes" }, { id: "b", content: "No" }], answer: "a" },
  ...extra,
});

const L = "modules/m1/lessons/l1";

/** A course exercising every reference kind, prose file, path field and link the bundler handles. */
const COURSE: Tree = {
  "course.json": {
    ocf_version: "0.3.0",
    id: "intro",
    title: "Intro",
    modules: [{ id: "m1", path: "modules/m1" }],
    prerequisites: [{ id: "other", course_url: "https://example.org/course.json" }],
  },
  "modules/m1/module.json": {
    ocf_version: "0.3.0",
    id: "m1",
    title: "M1",
    lessons: [{ id: "l1", path: "lessons/l1" }],
  },
  [`${L}/lesson.json`]: {
    ocf_version: "0.3.0",
    id: "l1",
    title: "L1",
    items: [
      { type: "article", id: "a1", path: "articles/a1" },
      { type: "video", id: "v1", path: "videos/v1" },
      { type: "practice_set", id: "s1", path: "../../../../sets/s1", required: true },
    ],
  },
  [`${L}/articles/a1/article.json`]: { oaf_version: "0.2.0", id: "a1", title: "A1", content: { file: "content.md" } },
  [`${L}/articles/a1/content.md`]: "See ![figure](assets/fig.png) and [notes](notes.md#part-2).",
  [`${L}/articles/a1/assets/fig.png`]: "PNG",
  [`${L}/articles/a1/notes.md`]: "Notes",
  [`${L}/videos/v1/video.json`]: {
    ovf_version: "0.1.0",
    id: "v1",
    title: "V1",
    video_url: "https://example.com/v1",
    captions: [{ language: "en", path: "captions/en.vtt" }],
  },
  [`${L}/videos/v1/captions/en.vtt`]: "WEBVTT",
  "sets/s1/set.json": {
    opf_version: "0.3.0",
    id: "s1",
    title: "S1",
    questions: [
      { id: "q1", path: "questions/q1", points: 2 },
      { id: "pool", select: 1, from: [{ id: "q2", path: "questions/q2" }, { id: "q3", path: "questions/q3" }] },
      {
        id: "g",
        label: "3",
        parts: [
          { id: "q1-again", label: "a", path: "questions/q1" },
          { id: "q3", label: "b", path: "questions/q3" },
        ],
      },
    ],
  },
  "sets/s1/questions/q1/question.json": {
    oqf_version: "0.2.0",
    id: "q1",
    type: "mcq",
    title: "Q1",
    statement: { file: "statement.md" },
    stimulus: { path: "../../stimuli/st1" },
    answer_key: { file: "answer-key.json" },
    type_config: { options: [{ id: "a", content: "Yes" }, { id: "b", content: "No" }] },
  },
  "sets/s1/questions/q1/statement.md": 'Look at <img src="img/q.png" alt="q">.',
  "sets/s1/questions/q1/img/q.png": "PNG",
  "sets/s1/questions/q1/answer-key.json": { answer: "a" },
  "sets/s1/stimuli/st1/stimulus.json": { oqf_version: "0.2.0", id: "st1", content: "Chart: ![chart](chart.png)" },
  "sets/s1/stimuli/st1/chart.png": "PNG",
  "sets/s1/questions/q2/question.json": {
    oqf_version: "0.2.0",
    id: "q2",
    type: "diagram",
    title: "Q2",
    statement: "Label it.",
    type_config: { image: "assets/d.png", labels: [{ id: "l", answer: "root", position: { x: 1, y: 2 } }] },
  },
  "sets/s1/questions/q2/assets/d.png": "PNG",
  "sets/s1/questions/q3/question.json": mcq("q3"),
};

async function bundleTree(tree: Tree, overrides: Partial<OpkPackage> = {}) {
  const root = await makePackage(tree);
  const index = await fileIndex(root, tree);
  return bundlePackage(fsSource(root), { ...manifest, ...overrides }, {
    fileIndex: index,
    fileExists: (p) => index.has(p),
    oesVersion: "0.3.0",
  });
}

describe("bundlePackage", () => {
  it("resolves every reference into a ref key and stores each document once", async () => {
    const { bundle, errors } = await bundleTree(COURSE);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle.documents).sort()).toEqual(
      [
        "article:a1",
        "course:intro",
        "lesson:l1",
        "module:m1",
        "question:q1",
        "question:q2",
        "question:q3",
        "set:s1",
        "stimulus:st1",
        "video:v1",
      ].sort(),
    );
    expect(bundle.entry).toEqual({ type: "course", id: "intro" });
    expect(bundle.package).toEqual({ name: "acme/intro", version: "1.0.0", digest: manifest.digest });
    expect(bundle.generated_from).toEqual({ oes_version: "0.3.0" });

    const docs = bundle.documents as Record<string, Record<string, unknown>>;
    expect(docs["course:intro"]!.modules).toEqual([{ id: "m1", ref: "module:m1" }]);
    // Suggestions and prerequisites are left alone.
    expect(docs["course:intro"]!.prerequisites).toEqual([{ id: "other", course_url: "https://example.org/course.json" }]);
    expect(docs["lesson:l1"]!.items).toEqual([
      { type: "article", id: "a1", ref: "article:a1" },
      { type: "video", id: "v1", ref: "video:v1" },
      { type: "practice_set", id: "s1", required: true, ref: "set:s1" },
    ]);
    expect(docs["set:s1"]!.questions).toEqual([
      { id: "q1", points: 2, ref: "question:q1" },
      { id: "pool", select: 1, from: [{ id: "q2", ref: "question:q2" }, { id: "q3", ref: "question:q3" }] },
      {
        id: "g",
        label: "3",
        parts: [
          { id: "q1-again", label: "a", ref: "question:q1" },
          { id: "q3", label: "b", ref: "question:q3" },
        ],
      },
    ]);
  });

  it("inlines prose, rewrites relative paths and links, and lists each file once in assets", async () => {
    const { bundle } = await bundleTree(COURSE);
    const docs = bundle.documents as Record<string, Record<string, unknown>>;
    expect(docs["article:a1"]!.content).toBe(
      `See ![figure](files/${L}/articles/a1/assets/fig.png) and [notes](files/${L}/articles/a1/notes.md#part-2).`,
    );
    expect(docs["question:q1"]!.statement).toBe('Look at <img src="files/sets/s1/questions/q1/img/q.png" alt="q">.');
    expect(docs["stimulus:st1"]!.content).toBe("Chart: ![chart](files/sets/s1/stimuli/st1/chart.png)");
    expect((docs["video:v1"]!.captions as Array<{ path: string }>)[0]!.path).toBe(`files/${L}/videos/v1/captions/en.vtt`);
    expect((docs["question:q2"]!.type_config as { image: string }).image).toBe("files/sets/s1/questions/q2/assets/d.png");
    expect(docs["question:q1"]!.stimulus).toEqual({ ref: "stimulus:st1" });

    const ids = bundle.assets!.map((a) => a.id);
    expect(ids).toEqual([...new Set(ids)].sort());
    expect(ids).toContain("sets/s1/questions/q1/img/q.png");
    const fig = bundle.assets!.find((a) => a.id === `${L}/articles/a1/assets/fig.png`)!;
    expect(fig.url).toBe(`files/${L}/articles/a1/assets/fig.png`);
    expect(fig.bytes).toBe(3);
    expect(fig.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("withholds answer keys, saying only that the question is graded", async () => {
    const { bundle } = await bundleTree(COURSE);
    const q1 = (bundle.documents as Record<string, Record<string, unknown>>)["question:q1"]!;
    expect(q1.answer_key).toEqual({ withheld: true });
    expect(JSON.stringify(bundle)).not.toContain("answer-key.json");
    expect(bundle.assets!.map((a) => a.id)).not.toContain("sets/s1/questions/q1/answer-key.json");
  });

  it("rewrites links once, also with an empty filesBase (content served from its own root)", async () => {
    const root = await makePackage(COURSE);
    const index = await fileIndex(root, COURSE);
    const { bundle, errors } = await bundlePackage(fsSource(root), manifest, { filesBase: "", fileExists: (p) => index.has(p) });
    expect(errors).toEqual([]);
    const docs = bundle.documents as Record<string, Record<string, unknown>>;
    expect(docs["article:a1"]!.content).toBe(`See ![figure](${L}/articles/a1/assets/fig.png) and [notes](${L}/articles/a1/notes.md#part-2).`);
    expect(docs["stimulus:st1"]!.content).toBe("Chart: ![chart](sets/s1/stimuli/st1/chart.png)");
    expect(docs["question:q3"]!.statement).toBe("Question q3");
  });

  it("produces byte-identical output on every run", async () => {
    const a = await bundleTree(COURSE);
    const b = await bundleTree(COURSE);
    expect(JSON.stringify(a.bundle)).toBe(JSON.stringify(b.bundle));
  });

  it("refuses two different documents that would share a key", async () => {
    const tree: Tree = {
      "set.json": {
        opf_version: "0.3.0",
        id: "s",
        title: "S",
        questions: [
          { id: "x", path: "a" },
          { id: "y", path: "b" },
        ],
      },
      "a/question.json": mcq("same"),
      "b/question.json": mcq("same", { title: "different" }),
    };
    const { errors } = await bundleTree(tree, { entry: { type: "set", path: "set.json" } });
    expect(errors.map((e) => e.message)).toContainEqual(expect.stringContaining('share the bundle key "question:same"'));
  });

  it("reports paths outside the package, missing images, external references and invalid documents", async () => {
    const tree: Tree = {
      "set.json": {
        opf_version: "0.3.0",
        id: "s",
        title: "S",
        questions: [
          { id: "out", path: "../elsewhere" },
          { id: "remote", question_url: "https://example.org/q.json" },
          { id: "img", path: "img" },
          { id: "bad", path: "bad" },
        ],
      },
      "img/question.json": mcq("img", { statement: "![missing](nope.png)" }),
      "bad/question.json": { oqf_version: "0.2.0", id: "bad", type: "mcq" },
    };
    const { errors } = await bundleTree(tree, { entry: { type: "set", path: "set.json" } });
    const messages = errors.map((e) => e.message).join("\n");
    expect(messages).toContain("leaves the package root");
    expect(messages).toContain("uses question_url");
    expect(messages).toContain('Image "nope.png" does not exist');
    expect(messages).toContain("Invalid question");
  });

  it("requires a digest on the manifest", async () => {
    const { errors } = await bundleTree(COURSE, { digest: undefined });
    expect(errors.map((e) => e.message)).toContainEqual(expect.stringContaining("no digest"));
  });
});

describe("packageDigest", () => {
  const tree: Tree = {
    "package.json": { name: "excluded" },
    "course.json": { id: "c" },
    "B.md": "upper sorts before lower",
    "a b/é.md": "spaces and non-ASCII",
    "z.md": "z",
  };

  it("matches the sha256sum one-liner given in the spec", async () => {
    const root = await makePackage(tree);
    const index = await fileIndex(root, tree);
    const files = [...index].map(([path, { sha256 }]) => ({ path, sha256 }));
    const shell = execSync(
      `find . -type f ! -path ./package.json -printf '%P\\0' | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`,
      { cwd: root, encoding: "utf8" },
    ).split(" ")[0];
    expect(await packageDigest(files)).toBe(`sha256-${shell}`);
  });

  it("ignores package.json and the order files are given in", async () => {
    const files = [
      { path: "z.md", sha256: "1".repeat(64) },
      { path: "a.md", sha256: "2".repeat(64) },
    ];
    const withManifest = [...files, { path: "package.json", sha256: "3".repeat(64) }];
    expect(await packageDigest(files)).toBe(await packageDigest([...withManifest].reverse()));
  });
});
