/**
 * The OPK package digest: `sha256-` plus the SHA-256 of a canonical
 * listing of every file except `package.json`, one
 * `"{sha256 hex}  {path}\n"` line per file, sorted by the paths' UTF-8
 * bytes. Each line is the format `sha256sum` prints, so a digest can be
 * checked by hand. See OPK's "Integrity" section.
 *
 * Uses Web Crypto, so it runs unchanged in Node and in a browser.
 */

export interface DigestFile {
  /** Relative to the package root, with `/` separators. */
  path: string;
  /** The file's SHA-256, as 64 hex characters. */
  sha256: string;
}

/** The SHA-256 of `bytes`, as 64 lowercase hex characters. */
export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  // A fresh copy is always backed by a plain ArrayBuffer, which Web Crypto requires.
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compare two strings by their UTF-8 bytes, as the digest's sort order requires. */
export function compareUtf8(a: string, b: string): number {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i++) {
    if (ea[i] !== eb[i]) return ea[i]! - eb[i]!;
  }
  return ea.length - eb.length;
}

/** The canonical listing the digest is computed over. `package.json` is excluded. */
export function digestListing(files: DigestFile[]): string {
  return files
    .filter((f) => f.path !== "package.json")
    .slice()
    .sort((a, b) => compareUtf8(a.path, b.path))
    .map((f) => `${f.sha256.toLowerCase()}  ${f.path}\n`)
    .join("");
}

/** The package digest over `files`, as `"sha256-{hex}"`. */
export async function packageDigest(files: DigestFile[]): Promise<string> {
  return `sha256-${await sha256Hex(digestListing(files))}`;
}
