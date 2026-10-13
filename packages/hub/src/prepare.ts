/**
 * Turning one tagged release into a publishable version: fetch it, build its
 * manifest (files + digest), lint it, and bundle it. Nothing here writes to
 * the hub; see `store.ts`.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  bundlePackage,
  compareUtf8,
  fsSource,
  packageDigest,
  sha256Hex,
  validate,
  type OpkFileEntry,
  type OpkPackage,
} from "@inklyre/oes-core";
import { lintCourse, lintSet, type LintResult } from "@inklyre/oes-lint";

const run = promisify(execFile);

/** The OES release this generator builds against, recorded in every bundle. */
export const OES_RELEASE = "0.3.0";

export interface Issue {
  severity: "error" | "warning";
  /** The package, and the version or tag when known, e.g. `acme/databases@v2.1.0`. */
  where: string;
  message: string;
}

export interface PreparedVersion {
  manifest: OpkPackage & { digest: string; files: OpkFileEntry[] };
  /** The bundled payload, serialised exactly as it will be published. */
  bundleText: string;
  bundleSha256: string;
  /** Absolute paths of the package files, keyed by package-relative path. */
  fileSources: Map<string, string>;
}

/** A shallow clone of `source` at `tag`, in a temporary directory. Call `cleanup()` when done. */
export async function fetchRelease(source: string, tag: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const { stdout } = await run("git", ["ls-remote", "--tags", source, `refs/tags/${tag}`], { timeout: 120_000 });
  if (stdout.trim() === "") throw new Error(`Tag "${tag}" does not exist in ${source}`);
  const dir = await mkdtemp(join(tmpdir(), "oes-hub-release-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    await run("git", ["clone", "--quiet", "--depth", "1", "--branch", tag, "--", source, dir], { timeout: 300_000 });
  } catch (cause) {
    await cleanup();
    throw new Error(`Could not clone ${source} at ${tag}`, { cause });
  }
  return { dir, cleanup };
}

/**
 * The package's files: everything under `root` except `package.json` (the
 * manifest itself), hidden files and folders (`.git`, `.github`…), and
 * `node_modules`.
 */
export async function packageFiles(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: string, rel: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else if (entry.isFile() && path !== "package.json") out.set(path, join(dir, entry.name));
    }
  };
  await walk(root, "");
  return out;
}

/**
 * Prepare the package at `root` for publishing as `expectedName`. Returns
 * the prepared version only when there are no errors.
 */
export async function preparePackage(
  root: string,
  expectedName: string,
  where: string,
): Promise<{ prepared?: PreparedVersion; issues: Issue[] }> {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: "error", where, message });

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  } catch {
    error("No readable package.json (the OPK manifest) at the package root");
    return { issues };
  }
  const checked = validate<OpkPackage>("opk.package", raw);
  if (!checked.valid) {
    for (const e of checked.errors ?? []) error(`package.json: ${e.instancePath || "/"} ${e.message}`);
    return { issues };
  }
  const manifest = checked.data!;
  if (manifest.name !== expectedName) {
    error(`package.json names "${manifest.name}", but this source file publishes "${expectedName}"`);
    return { issues };
  }

  const fileSources = await packageFiles(root);
  const files: OpkFileEntry[] = [];
  for (const [path, abs] of fileSources) {
    const bytes = await readFile(abs);
    files.push({ path, sha256: await sha256Hex(bytes), bytes: bytes.length });
  }
  files.sort((a, b) => compareUtf8(a.path, b.path));
  const digest = await packageDigest(files);
  if (manifest.digest !== undefined && manifest.digest !== digest) {
    error(`package.json declares digest ${manifest.digest}, but the files hash to ${digest}`);
  }
  if (manifest.files !== undefined && JSON.stringify(manifest.files) !== JSON.stringify(files)) {
    error("package.json declares a files list that does not match the package's files");
  }
  if (issues.length) return { issues };

  const full = { ...manifest, digest, files };

  let lint: LintResult | undefined;
  if (manifest.entry.type === "course") lint = await lintCourse(fsSource(root), manifest.entry.path);
  else if (manifest.entry.type === "set") lint = await lintSet(fsSource(root), manifest.entry.path);
  for (const issue of lint?.issues ?? []) {
    issues.push({ severity: issue.severity, where, message: `[${issue.rule}] ${issue.at}: ${issue.message}` });
  }

  const index = new Map(files.map((f) => [f.path, { sha256: f.sha256, bytes: f.bytes }]));
  const { bundle, errors } = await bundlePackage(fsSource(root), full, {
    fileIndex: index,
    fileExists: (p) => index.has(p),
    oesVersion: OES_RELEASE,
  });
  for (const e of errors) error(`bundle: ${e.at}: ${e.message}`);

  if (issues.some((i) => i.severity === "error")) return { issues };
  const bundleText = JSON.stringify(bundle);
  return {
    prepared: { manifest: full, bundleText, bundleSha256: `sha256-${await sha256Hex(bundleText)}`, fileSources },
    issues,
  };
}
