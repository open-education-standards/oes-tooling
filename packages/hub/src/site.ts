/**
 * Generating a hub's static site from its store: `index.json`, one hub
 * package document per package, each version's files, and browse pages.
 * Every hub document is validated against the OPK schemas before it is
 * written, so a generator bug can't publish an invalid hub.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  validate,
  type DocumentType,
  type OpkBundle,
  type OpkHub,
  type OpkHubPackage,
  type OpkHubPackageSummary,
  type OpkPublishedVersion,
} from "@inklyre/oes-core";
import type { HubConfig, PackageSource, StoredVersion } from "./hub-files.js";
import { indexPage, packagePage, SEARCH_JS, STYLE_CSS } from "./html.js";
import { compareSemver } from "./semver.js";

function checked<T>(docType: DocumentType, doc: T, what: string): T {
  const result = validate(docType, doc);
  if (!result.valid) {
    const detail = (result.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    throw new Error(`Generated ${what} is not a valid ${docType} document: ${detail}`);
  }
  return doc;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function generateSite(
  config: HubConfig,
  store: StoredVersion[],
  sources: PackageSource[],
  outDir: string,
): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "packages"), { recursive: true });

  const yanked = new Map<string, string | true>();
  for (const src of sources) {
    for (const v of src.versions) if (v.yanked !== undefined) yanked.set(`${src.name}#${v.tag}`, v.yanked);
  }

  const byName = new Map<string, StoredVersion[]>();
  for (const s of store) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);

  const summaries: OpkHubPackageSummary[] = [];
  for (const name of [...byName.keys()].sort()) {
    const [ns, pkg] = name.split("/") as [string, string];
    const versions = byName.get(name)!.sort((a, b) => compareSemver(b.version, a.version));
    const pkgDir = join(outDir, "packages", ns);

    const published: OpkPublishedVersion[] = [];
    for (const v of versions) {
      const target = join(pkgDir, pkg, v.version);
      await mkdir(target, { recursive: true });
      for (const file of ["package.json", "bundle.json"]) await cp(join(v.dir, file), join(target, file));
      await cp(join(v.dir, "files"), join(target, "files"), { recursive: true });
      const y = yanked.get(`${name}#${v.meta.tag}`);
      published.push({
        version: v.version,
        digest: v.manifest.digest!,
        published_at: v.meta.published_at,
        manifest: `${pkg}/${v.version}/package.json`,
        bundle: `${pkg}/${v.version}/bundle.json`,
        bundle_sha256: v.meta.bundle_sha256,
        files: `${pkg}/${v.version}/files/`,
        ...(y !== undefined ? { yanked: true, ...(typeof y === "string" ? { yanked_reason: y } : {}) } : {}),
      });
    }

    const doc = checked<OpkHubPackage>(
      "opk.hub-package",
      { opk_version: "0.2.0", kind: "hub-package", name, versions: published },
      `packages/${name}.json`,
    );
    await writeJson(join(pkgDir, `${pkg}.json`), doc);

    const latest = versions.find((v) => !yanked.has(`${name}#${v.meta.tag}`));
    let bundle: OpkBundle | undefined;
    if (latest) {
      const m = latest.manifest;
      summaries.push({
        name,
        title: m.title,
        ...(m.description ? { description: m.description } : {}),
        entry_type: m.entry.type,
        ...(m.tags?.length ? { tags: m.tags } : {}),
        latest: latest.version,
        url: `packages/${name}.json`,
      });
      bundle = JSON.parse(await readFile(join(latest.dir, "bundle.json"), "utf8")) as OpkBundle;
    }
    await writeFile(
      join(pkgDir, pkg, "index.html"),
      packagePage(config, doc, (latest ?? versions[0]!).manifest, bundle, latest?.version),
    );
  }

  const index = checked<OpkHub>(
    "opk.hub",
    {
      opk_version: "0.2.0",
      kind: "hub",
      hub: { title: config.title, ...(config.description ? { description: config.description } : {}), homepage: "./" },
      packages: summaries,
    },
    "index.json",
  );
  await writeJson(join(outDir, "index.json"), index);
  await writeFile(join(outDir, "index.html"), indexPage(config, summaries));
  await writeFile(join(outDir, "style.css"), STYLE_CSS);
  await writeFile(join(outDir, "search.js"), SEARCH_JS);
}
