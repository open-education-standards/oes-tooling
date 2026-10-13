/**
 * Builds an OPK bundled payload from a package: every reference resolved,
 * all prose inlined, each document stored once under `{type}:{id}`, every
 * relative path rewritten relative to the bundle, and answer keys
 * withheld. See OPK's "The Bundled Payload".
 *
 * Reads through one {@link ContentSource} rooted at the package root, using
 * package-relative paths throughout, so it runs the same over a directory
 * or a URL and in Node or a browser.
 */
import type { ContentSource } from "./content-source.js";
import { contentHashMatches } from "./hash.js";
import { isProseFile, type Prose } from "./types/common.js";
import type { OpkBundle, OpkBundleAsset, OpkEntryType, OpkPackage } from "./types/opk.js";
import { validate, type DocumentType } from "./validate.js";

export interface BundleError {
  /** Package-relative file, or a path within the bundle, where this happened. */
  at: string;
  message: string;
  cause?: unknown;
}

export interface BundleOptions {
  /** Where the package's files are served, relative to the bundle. Default `"files/"`. */
  filesBase?: string;
  /** Hash and size of package files, used to fill in `assets[]`. */
  fileIndex?: ReadonlyMap<string, { sha256: string; bytes: number }>;
  /**
   * Whether a package-relative file exists. When given, an image that
   * points at a missing file is an error.
   */
  fileExists?: (path: string) => boolean;
  /** The OES release the bundler targets, recorded as `generated_from.oes_version`. */
  oesVersion?: string;
}

export interface BundleResult {
  bundle: OpkBundle;
  errors: BundleError[];
}

type BundleType = "course" | "module" | "lesson" | "article" | "video" | "resource" | "set" | "question" | "stimulus";

const DOC: Record<BundleType, { file: string; docType: DocumentType }> = {
  course: { file: "course.json", docType: "ocf.course" },
  module: { file: "module.json", docType: "ocf.module" },
  lesson: { file: "lesson.json", docType: "ocf.lesson" },
  article: { file: "article.json", docType: "oaf.article" },
  video: { file: "video.json", docType: "ovf.video" },
  resource: { file: "resource.json", docType: "orf.resource" },
  set: { file: "set.json", docType: "opf.set" },
  question: { file: "question.json", docType: "oqf.question" },
  stimulus: { file: "stimulus.json", docType: "oqf.stimulus" },
};

const ENTRY_TYPE: Record<OpkEntryType, BundleType> = {
  course: "course",
  set: "set",
  article: "article",
  video: "video",
  resource: "resource",
};

/** Lesson item `type` → the bundle type and the URL field a non-local item would use. */
const LESSON_ITEM: Record<string, { type: BundleType; urlField: string }> = {
  article: { type: "article", urlField: "article_url" },
  video: { type: "video", urlField: "video_lesson_url" },
  practice_set: { type: "set", urlField: "set_url" },
  resource: { type: "resource", urlField: "resource_url" },
};

/** Keys whose string values are Markdown prose, in any document. */
const PROSE_KEYS = new Set(["statement", "explanation", "content"]);

type Json = Record<string, unknown>;

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Join and normalise package-relative paths. `undefined` if the result leaves the root. */
export function joinPackagePath(dir: string, rel: string): string | undefined {
  const parts: string[] = [];
  for (const seg of `${dir}/${rel}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

/** True for a link target that is a relative path, not a URL, anchor or absolute path. */
function isRelativeTarget(target: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("/") && !target.startsWith("#");
}

class Bundler {
  readonly documents: Record<string, unknown> = {};
  readonly errors: BundleError[] = [];
  private readonly assets = new Map<string, OpkBundleAsset>();
  private readonly keyByLocation = new Map<string, string>();
  private readonly canonicalByKey = new Map<string, string>();
  private readonly filesBase: string;

  constructor(
    private readonly source: ContentSource,
    private readonly options: BundleOptions,
  ) {
    this.filesBase = options.filesBase ?? "files/";
  }

  assetList(): OpkBundleAsset[] {
    return [...this.assets.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Load, validate and bundle the document at `location`; returns its key. */
  async visit(type: BundleType, location: string): Promise<string | undefined> {
    const known = this.keyByLocation.get(location);
    if (known) return known;

    let data: unknown;
    try {
      ({ data } = await this.source.fetch(location));
    } catch (cause) {
      this.errors.push({ at: location, message: `Could not read ${type} document`, cause });
      return undefined;
    }
    const result = validate(DOC[type].docType, data);
    if (!result.valid) {
      for (const e of result.errors ?? []) {
        this.errors.push({ at: location, message: `Invalid ${type}: ${e.instancePath || "/"} ${e.message}` });
      }
      return undefined;
    }

    const doc = structuredClone(data) as Json;
    const key = `${type}:${String(doc.id)}`;
    this.keyByLocation.set(location, key);
    const dir = dirOf(location);

    // Inline prose strings first, then prose files: each piece of prose is
    // rewritten exactly once, relative to where it was written.
    this.rewriteProse(doc, dir, location);
    await this.processDocument(type, doc, dir, location);

    const canonical = JSON.stringify(doc);
    const existing = this.canonicalByKey.get(key);
    if (existing !== undefined && existing !== canonical) {
      this.errors.push({
        at: location,
        message: `Two different documents would share the bundle key "${key}"; give one a different id`,
      });
      return key;
    }
    this.canonicalByKey.set(key, canonical);
    this.documents[key] = doc;
    return key;
  }

  private async processDocument(type: BundleType, doc: Json, dir: string, at: string): Promise<void> {
    switch (type) {
      case "course":
        await this.refs(doc, "modules", "module", dir, at);
        break;
      case "module":
        await this.refs(doc, "lessons", "lesson", dir, at);
        break;
      case "lesson":
        await this.lessonItems(doc, dir, at);
        break;
      case "set":
        if (Array.isArray(doc.questions)) {
          doc.questions = await this.setEntries(doc.questions as Json[], dir, at);
        }
        break;
      case "question":
        doc.statement = await this.inline(doc.statement as Prose | undefined, dir, at);
        if (doc.stimulus && typeof doc.stimulus === "object") {
          doc.stimulus = await this.ref(doc.stimulus as Json, "stimulus", "stimulus_url", dir, at);
        }
        if (doc.answer_key !== undefined) doc.answer_key = { withheld: true };
        this.diagramImage(doc, dir, at);
        break;
      case "stimulus":
      case "article":
        if (doc.content !== undefined) doc.content = await this.inline(doc.content as Prose, dir, at);
        break;
      case "video":
        if (Array.isArray(doc.captions)) {
          for (const c of doc.captions as Json[]) {
            if (typeof c.path === "string") c.path = this.filePath(c.path, dir, at, true);
          }
        }
        break;
      case "resource":
        break;
    }
    if (typeof doc.local_path === "string") doc.local_path = this.filePath(doc.local_path, dir, at, true);
    if (Array.isArray(doc.related)) {
      for (const r of doc.related as Json[]) {
        if (typeof r.path === "string") r.path = this.filePath(r.path, dir, at, false);
      }
    }
  }

  /** Resolve `doc[field][]`, where each entry is `{id, path}` into a `type` document. */
  private async refs(doc: Json, field: string, type: BundleType, dir: string, at: string): Promise<void> {
    const list = doc[field];
    if (!Array.isArray(list)) return;
    // One at a time, so documents are added in the same order on every run
    // and the bundle's bytes are reproducible.
    const out: Json[] = [];
    for (const entry of list) out.push(await this.ref(entry as Json, type, `${type}_url`, dir, at));
    doc[field] = out;
  }

  /** One reference: keep its fields, swap `path`/`urlField` for `ref`. */
  private async ref(entry: Json, type: BundleType, urlField: string, dir: string, at: string): Promise<Json> {
    const { path, [urlField]: url, ...rest } = entry;
    if (typeof url === "string") {
      this.errors.push({
        at,
        message: `${type} reference uses ${urlField}; a bundle only resolves content inside the package`,
      });
      return entry;
    }
    if (typeof path !== "string") {
      this.errors.push({ at, message: `${type} reference has no path` });
      return entry;
    }
    const target = joinPackagePath(dir, path.endsWith(".json") ? path : `${path.replace(/\/+$/, "")}/${DOC[type].file}`);
    if (target === undefined) {
      this.errors.push({ at, message: `${type} reference "${path}" leaves the package root` });
      return entry;
    }
    const key = await this.visit(type, target);
    if (key && typeof entry.content_hash === "string") {
      try {
        const raw = await this.source.fetchText(target);
        if ((await contentHashMatches(raw, entry.content_hash)) === false) {
          this.errors.push({ at, message: `content_hash does not match ${target}` });
        }
      } catch {
        // Already reported by visit().
      }
    }
    return key ? { ...rest, ref: key } : entry;
  }

  private async lessonItems(doc: Json, dir: string, at: string): Promise<void> {
    if (!Array.isArray(doc.items)) return;
    const out: Json[] = [];
    for (const item of doc.items as Json[]) {
      const kind = LESSON_ITEM[String(item.type)];
      if (!kind) {
        this.errors.push({ at, message: `Unknown lesson item type "${String(item.type)}"` });
        out.push(item);
        continue;
      }
      out.push(await this.ref(item, kind.type, kind.urlField, dir, at));
    }
    doc.items = out;
  }

  /** A set's `questions[]`: direct entries, pools (`from`) and groups (`parts`). */
  private async setEntries(entries: Json[], dir: string, at: string): Promise<Json[]> {
    const out: Json[] = [];
    for (const entry of entries) {
      if (Array.isArray(entry.parts)) {
        out.push({ ...entry, parts: await this.setEntries(entry.parts as Json[], dir, at) });
      } else if (Array.isArray(entry.from)) {
        const from: Json[] = [];
        for (const c of entry.from as Json[]) from.push(await this.ref(c, "question", "question_url", dir, at));
        out.push({ ...entry, from });
      } else {
        out.push(await this.ref(entry, "question", "question_url", dir, at));
      }
    }
    return out;
  }

  /** Replace a `{file}` prose reference with its text, rewriting its relative links. */
  private async inline(prose: Prose | undefined, dir: string, at: string): Promise<Prose | undefined> {
    if (prose === undefined || !isProseFile(prose)) return prose;
    const location = joinPackagePath(dir, prose.file);
    if (location === undefined) {
      this.errors.push({ at, message: `Prose file "${prose.file}" leaves the package root` });
      return prose;
    }
    try {
      const text = await this.source.fetchText(location);
      if (prose.content_hash && (await contentHashMatches(text, prose.content_hash)) === false) {
        this.errors.push({ at: location, message: "content_hash does not match the prose file" });
      }
      // Links in a prose file are relative to the file itself.
      return this.rewriteMarkdown(text, dirOf(location), location);
    } catch (cause) {
      this.errors.push({ at, message: `Could not read prose file "${prose.file}"`, cause });
      return prose;
    }
  }

  private diagramImage(doc: Json, dir: string, at: string): void {
    const config = doc.type_config as Json | undefined;
    if (doc.type !== "diagram" || !config) return;
    const image = config.image;
    if (typeof image === "string") config.image = this.filePath(image, dir, at, true);
    else if (image && typeof image === "object" && typeof (image as Json).file === "string") {
      (image as Json).file = this.filePath((image as Json).file as string, dir, at, true);
    }
  }

  /**
   * Rewrite a package-relative file path relative to the bundle. `isFile`
   * paths are checked and listed in `assets`; a `related` path may name a
   * folder, so it is only rewritten.
   */
  private filePath(rel: string, dir: string, at: string, isFile: boolean): string {
    if (!isRelativeTarget(rel)) return rel;
    const path = joinPackagePath(dir, rel);
    if (path === undefined) {
      this.errors.push({ at, message: `Path "${rel}" leaves the package root` });
      return rel;
    }
    if (isFile) {
      if (this.options.fileExists && !this.options.fileExists(path)) {
        this.errors.push({ at, message: `File "${rel}" does not exist in the package` });
      }
      this.addAsset(path);
    }
    return this.filesBase + path;
  }

  private addAsset(path: string): void {
    if (this.assets.has(path)) return;
    const info = this.options.fileIndex?.get(path);
    this.assets.set(path, {
      id: path,
      url: this.filesBase + path,
      ...(info ? { sha256: info.sha256, bytes: info.bytes } : {}),
    });
  }

  /** Rewrite relative links in every Markdown prose string of `doc`, in place. */
  private rewriteProse(value: unknown, dir: string, at: string, key?: string): unknown {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        value[i] = this.rewriteProse(value[i], dir, at, key === "hints" ? "hints" : undefined);
      }
      return value;
    }
    if (value && typeof value === "object") {
      const obj = value as Json;
      for (const k of Object.keys(obj)) {
        if (k === "ref") continue;
        obj[k] = this.rewriteProse(obj[k], dir, at, k);
      }
      return obj;
    }
    if (typeof value === "string" && key !== undefined && (PROSE_KEYS.has(key) || key === "hints")) {
      return this.rewriteMarkdown(value, dir, at);
    }
    return value;
  }

  private rewriteMarkdown(text: string, dir: string, at: string): string {
    const rewrite = (target: string, image: boolean): string => {
      if (!isRelativeTarget(target)) return target;
      const hashAt = target.search(/[?#]/);
      const bare = hashAt === -1 ? target : target.slice(0, hashAt);
      const suffix = hashAt === -1 ? "" : target.slice(hashAt);
      if (bare === "") return target;
      let decoded: string;
      try {
        decoded = decodeURI(bare);
      } catch {
        this.errors.push({ at, message: `Link "${target}" is not a valid URL` });
        return target;
      }
      const path = joinPackagePath(dir, decoded);
      if (path === undefined) {
        this.errors.push({ at, message: `Link "${target}" leaves the package root` });
        return target;
      }
      const exists = this.options.fileExists ? this.options.fileExists(path) : true;
      if (image && !exists) this.errors.push({ at, message: `Image "${target}" does not exist in the package` });
      if (exists) this.addAsset(path);
      return this.filesBase + encodeURI(path) + suffix;
    };
    return text
      .replace(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g, (_m, bang: string, label: string, target: string, title: string) =>
        `${bang}[${label}](${rewrite(target, bang === "!")}${title})`,
      )
      .replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (_m, pre: string, target: string, post: string) => `${pre}${rewrite(target, true)}${post}`);
  }
}

/**
 * Bundle a package whose files are readable through `source` (rooted at the
 * package root). `manifest.digest` is recorded in the bundle and should be
 * set before calling. Problems never throw; they are returned in `errors`,
 * and a bundle with any error should not be published.
 */
export async function bundlePackage(
  source: ContentSource,
  manifest: OpkPackage,
  options: BundleOptions = {},
): Promise<BundleResult> {
  const bundler = new Bundler(source, options);
  if (!manifest.digest) {
    bundler.errors.push({ at: "package.json", message: "The manifest has no digest; compute it before bundling" });
  }
  const entryType = ENTRY_TYPE[manifest.entry.type];
  const entryPath = joinPackagePath("", manifest.entry.path);
  const entryKey = entryPath === undefined ? undefined : await bundler.visit(entryType, entryPath);
  if (entryPath === undefined) bundler.errors.push({ at: "package.json", message: "entry.path leaves the package root" });

  const bundle: OpkBundle = {
    opk_version: "0.2.0",
    kind: "bundle",
    package: { name: manifest.name, version: manifest.version, digest: manifest.digest ?? "" },
    ...(options.oesVersion ? { generated_from: { oes_version: options.oesVersion } } : {}),
    entry: { type: manifest.entry.type, id: entryKey ? entryKey.slice(entryKey.indexOf(":") + 1) : "" },
    documents: bundler.documents,
    assets: bundler.assetList(),
  };
  return { bundle, errors: bundler.errors };
}
