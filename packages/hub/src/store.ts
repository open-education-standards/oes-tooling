/**
 * `store/{namespace}/{name}/{version}/` holds each published version exactly
 * as it was published: `package.json` (with `files` and `digest`),
 * `bundle.json`, `meta.json` and `files/`. A version is written once and
 * never changed, so a release survives its source repository being edited,
 * re-tagged or deleted.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { packageDigest, sha256Hex } from "@inklyre/oes-core";
import type { StoreMeta, StoredVersion } from "./hub-files.js";
import type { Issue, PreparedVersion } from "./prepare.js";

export function storeDir(hubDir: string, name: string, version: string): string {
  return join(hubDir, "store", ...name.split("/"), version);
}

export async function writeVersion(hubDir: string, prepared: PreparedVersion, meta: StoreMeta): Promise<string> {
  const dir = storeDir(hubDir, prepared.manifest.name, prepared.manifest.version);
  await mkdir(join(dir, "files"), { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify(prepared.manifest, null, 2) + "\n");
  await writeFile(join(dir, "bundle.json"), prepared.bundleText);
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  for (const [path, abs] of prepared.fileSources) {
    const target = join(dir, "files", ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(abs, target);
  }
  return dir;
}

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), path)));
    else out.push(path);
  }
  return out;
}

/**
 * Check a stored version is intact: its files match the manifest's `files`
 * and `digest`, and its bundle matches `meta.bundle_sha256` and names the
 * same digest. Anything else means the store was edited by hand.
 */
export async function verifyStoredVersion(v: StoredVersion): Promise<Issue[]> {
  const where = `${v.name}@${v.version}`;
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: "error", where, message: `store: ${message}` });
  const m = v.manifest;

  if (m.name !== v.name || m.version !== v.version) error("package.json does not match its store directory");
  if (!m.digest || !m.files) {
    error("package.json has no digest or files");
    return issues;
  }

  const listed = new Map(m.files.map((f) => [f.path, f]));
  const present = await listFiles(join(v.dir, "files"));
  for (const path of present) if (!listed.has(path)) error(`files/${path} is not in the manifest`);
  for (const f of m.files) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(v.dir, "files", ...f.path.split("/")));
    } catch {
      error(`files/${f.path} is missing`);
      continue;
    }
    if (bytes.length !== f.bytes || (await sha256Hex(bytes)) !== f.sha256.toLowerCase()) {
      error(`files/${f.path} does not match its manifest entry`);
    }
  }
  if ((await packageDigest(m.files)) !== m.digest) error("the manifest's digest does not match its files");

  const bundleText = await readFile(join(v.dir, "bundle.json"), "utf8");
  if (`sha256-${await sha256Hex(bundleText)}` !== v.meta.bundle_sha256) error("bundle.json does not match meta.json's bundle_sha256");
  try {
    if (JSON.parse(bundleText)?.package?.digest !== m.digest) error("bundle.json names a different digest");
  } catch {
    error("bundle.json is not valid JSON");
  }
  return issues;
}
