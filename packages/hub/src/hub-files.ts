/**
 * Reading a hub's own files: `hub.json` (the hub's config), one source file
 * per package under `packages/{namespace}/{name}.yml`, and `store/`, where
 * each published version is written exactly once.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OpkPackage } from "@inklyre/oes-core";
import { parse as parseYaml } from "yaml";

export const NAME_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type NamespaceRule = "github-owner" | "any";

export interface HubConfig {
  title: string;
  description?: string;
  /** The hub's public base URL, if known; shown on its pages. */
  url?: string;
  /**
   * `github-owner` (default): a package's namespace must equal the GitHub
   * owner of its source repository. `any`: no rule, for hubs whose
   * maintainers review every namespace themselves.
   */
  namespace_rule: NamespaceRule;
}

export interface SourceVersion {
  /** The git tag to publish. */
  tag: string;
  /** Set when the version is yanked: the reason, or `true` for none. */
  yanked?: string | true;
}

export interface PackageSource {
  /** `{namespace}/{name}`, from the source file's path. */
  name: string;
  /** Where the source file is, relative to the hub root. */
  file: string;
  /** A git repository URL (or a local path, for testing). */
  source: string;
  /** The package's folder inside the repository. Default: its root. */
  path: string;
  versions: SourceVersion[];
}

/** What the hub records about a stored version, beside its manifest and bundle. */
export interface StoreMeta {
  tag: string;
  source: string;
  published_at: string;
  bundle_sha256: string;
}

export interface StoredVersion {
  name: string;
  version: string;
  /** Absolute path of the version's store directory. */
  dir: string;
  manifest: OpkPackage;
  meta: StoreMeta;
}

export class HubFileError extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function readHubConfig(hubDir: string): Promise<HubConfig> {
  const file = join(hubDir, "hub.json");
  let data: unknown;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new HubFileError(`Could not read hub.json in ${hubDir}`, { cause });
  }
  if (!isObject(data) || typeof data.title !== "string" || data.title === "") {
    throw new HubFileError("hub.json must have a non-empty \"title\"");
  }
  const rule = data.namespace_rule ?? "github-owner";
  if (rule !== "github-owner" && rule !== "any") {
    throw new HubFileError('hub.json "namespace_rule" must be "github-owner" or "any"');
  }
  if (data.url !== undefined && (typeof data.url !== "string" || !data.url.startsWith("https://"))) {
    throw new HubFileError('hub.json "url" must be an https:// URL');
  }
  return {
    title: data.title,
    ...(typeof data.description === "string" ? { description: data.description } : {}),
    ...(typeof data.url === "string" ? { url: data.url.replace(/\/?$/, "/") } : {}),
    namespace_rule: rule,
  };
}

/** Parse one `packages/{namespace}/{name}.yml`. Problems are thrown with the file named. */
export function parsePackageSource(name: string, file: string, text: string): PackageSource {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (cause) {
    throw new HubFileError(`${file}: not valid YAML`, { cause });
  }
  if (!isObject(data)) throw new HubFileError(`${file}: expected a mapping`);
  if (typeof data.source !== "string" || data.source === "") {
    throw new HubFileError(`${file}: "source" must be a git repository URL`);
  }
  if (data.path !== undefined && typeof data.path !== "string") {
    throw new HubFileError(`${file}: "path" must be a string`);
  }
  if (typeof data.path === "string" && (data.path.startsWith("/") || data.path.split("/").includes(".."))) {
    throw new HubFileError(`${file}: "path" must stay inside the repository`);
  }
  if (!Array.isArray(data.versions) || data.versions.length === 0) {
    throw new HubFileError(`${file}: "versions" must list at least one { tag } entry`);
  }
  const tags = new Set<string>();
  const versions = data.versions.map((v, i): SourceVersion => {
    if (!isObject(v) || typeof v.tag !== "string" || v.tag === "") {
      throw new HubFileError(`${file}: versions[${i}] needs a "tag"`);
    }
    if (tags.has(v.tag)) throw new HubFileError(`${file}: tag "${v.tag}" is listed twice`);
    tags.add(v.tag);
    if (v.yanked !== undefined && v.yanked !== true && typeof v.yanked !== "string") {
      throw new HubFileError(`${file}: versions[${i}].yanked must be true or a reason`);
    }
    return { tag: v.tag, ...(v.yanked !== undefined ? { yanked: v.yanked as string | true } : {}) };
  });
  return {
    name,
    file,
    source: data.source,
    path: (data.path as string | undefined)?.replace(/^\.?\/*|\/+$/g, "") ?? "",
    versions,
  };
}

/** Every `packages/{namespace}/{name}.yml` in the hub, sorted by name. */
export async function readPackageSources(hubDir: string): Promise<PackageSource[]> {
  const root = join(hubDir, "packages");
  if (!existsSync(root)) return [];
  const out: PackageSource[] = [];
  for (const ns of (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    for (const entry of await readdir(join(root, ns.name), { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const base = entry.name.replace(/\.ya?ml$/, "");
      const file = `packages/${ns.name}/${entry.name}`;
      if (!NAME_SEGMENT.test(ns.name) || !NAME_SEGMENT.test(base)) {
        throw new HubFileError(`${file}: namespace and package name must be kebab-case`);
      }
      out.push(parsePackageSource(`${ns.name}/${base}`, file, await readFile(join(root, ns.name, entry.name), "utf8")));
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Every version in `store/{namespace}/{name}/{version}/`. */
export async function readStore(hubDir: string): Promise<StoredVersion[]> {
  const root = join(hubDir, "store");
  if (!existsSync(root)) return [];
  const out: StoredVersion[] = [];
  const dirs = async (p: string) => (await readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const ns of await dirs(root)) {
    for (const pkg of await dirs(join(root, ns))) {
      for (const version of await dirs(join(root, ns, pkg))) {
        const dir = join(root, ns, pkg, version);
        const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as OpkPackage;
        const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as StoreMeta;
        out.push({ name: `${ns}/${pkg}`, version, dir, manifest, meta });
      }
    }
  }
  return out;
}

/** The GitHub owner of a `https://github.com/{owner}/{repo}` URL, or undefined. */
export function githubOwner(source: string): string | undefined {
  const m = source.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/[A-Za-z0-9._-]+?(?:\.git)?\/?$/);
  return m?.[1];
}
