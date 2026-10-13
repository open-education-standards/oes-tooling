/**
 * Checking and building a hub. `checkHub` validates everything and publishes
 * nothing; `buildHub` also writes new versions to `store/` and, given an
 * output directory, generates the static site.
 */
import {
  githubOwner,
  readHubConfig,
  readPackageSources,
  readStore,
  type HubConfig,
  type PackageSource,
  type StoredVersion,
} from "./hub-files.js";
import { fetchRelease, preparePackage, type Issue } from "./prepare.js";
import { generateSite } from "./site.js";
import { verifyStoredVersion, writeVersion } from "./store.js";

export interface HubRunOptions {
  /** Write newly published versions to `store/`. */
  write: boolean;
  /** Generate the static site here (after any writes). */
  out?: string;
  /** The publication date to record, `YYYY-MM-DD`. Default: today (UTC). */
  today?: string;
  /** Progress messages. */
  log?: (message: string) => void;
}

export interface HubRunResult {
  config: HubConfig;
  issues: Issue[];
  /** `{name}@{version}` for each version this run published (or would publish, in a check). */
  published: string[];
  ok: boolean;
}

/** The namespace rule's verdict on a source, or undefined when it passes. */
export function namespaceProblem(config: HubConfig, src: PackageSource): string | undefined {
  if (config.namespace_rule !== "github-owner") return undefined;
  const owner = githubOwner(src.source);
  const namespace = src.name.split("/")[0]!;
  if (!owner) return `source must be a https://github.com/{owner}/{repo} URL (this hub requires the namespace to be the repository's GitHub owner)`;
  if (owner.toLowerCase() !== namespace) return `namespace "${namespace}" must equal the source repository's GitHub owner, "${owner}"`;
  return undefined;
}

async function run(hubDir: string, options: HubRunOptions): Promise<HubRunResult> {
  const log = options.log ?? (() => {});
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const config = await readHubConfig(hubDir);
  const sources = await readPackageSources(hubDir);
  const store = await readStore(hubDir);
  const issues: Issue[] = [];
  const published: string[] = [];

  for (const stored of store) issues.push(...(await verifyStoredVersion(stored)));

  const byVersion = new Map(store.map((s) => [`${s.name}@${s.version}`, s]));
  const byTag = new Map(store.map((s) => [`${s.name}#${s.meta.tag}`, s]));

  for (const src of sources) {
    const problem = namespaceProblem(config, src);
    if (problem) {
      issues.push({ severity: "error", where: src.name, message: `${src.file}: ${problem}` });
      continue;
    }
    for (const entry of src.versions) {
      if (byTag.has(`${src.name}#${entry.tag}`)) continue;
      const where = `${src.name}@${entry.tag}`;
      log(`fetching ${where}`);
      let release: Awaited<ReturnType<typeof fetchRelease>>;
      try {
        release = await fetchRelease(src.source, entry.tag);
      } catch (cause) {
        issues.push({ severity: "error", where, message: (cause as Error).message });
        continue;
      }
      try {
        const root = src.path ? `${release.dir}/${src.path}` : release.dir;
        const { prepared, issues: found } = await preparePackage(root, src.name, where);
        issues.push(...found);
        if (!prepared) continue;
        const key = `${src.name}@${prepared.manifest.version}`;
        const existing = byVersion.get(key);
        if (existing) {
          issues.push({
            severity: "error",
            where,
            message: `version ${prepared.manifest.version} is already published (from tag "${existing.meta.tag}"); published versions never change, so bump the version`,
          });
          continue;
        }
        published.push(key);
        const meta = { tag: entry.tag, source: src.source, published_at: today, bundle_sha256: prepared.bundleSha256 };
        if (options.write) {
          const dir = await writeVersion(hubDir, prepared, meta);
          log(`published ${key}`);
          const stored: StoredVersion = { name: src.name, version: prepared.manifest.version, dir, manifest: prepared.manifest, meta };
          byVersion.set(key, stored);
          byTag.set(`${src.name}#${entry.tag}`, stored);
        } else {
          // Reserve the version so a second tag can't claim it in the same check.
          byVersion.set(key, { name: src.name, version: prepared.manifest.version, dir: "", manifest: prepared.manifest, meta });
        }
      } finally {
        await release.cleanup();
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  if (options.out && ok) {
    await generateSite(config, await readStore(hubDir), sources, options.out);
    log(`site written to ${options.out}`);
  }
  return { config, issues, published, ok };
}

/** Validate the hub and every unpublished version. Writes nothing. */
export function checkHub(hubDir: string, options: Omit<HubRunOptions, "write" | "out"> = {}): Promise<HubRunResult> {
  return run(hubDir, { ...options, write: false });
}

/** Publish new versions to `store/` and, with `out`, generate the site. */
export function buildHub(hubDir: string, options: Omit<HubRunOptions, "write"> = {}): Promise<HubRunResult> {
  return run(hubDir, { ...options, write: true });
}
