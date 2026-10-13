const HASH_PATTERN = /^sha256-([A-Fa-f0-9]{64})$/;

/**
 * Hash raw document text the same way every `content_hash` field is
 * formatted across the specs: `"sha256-{hex}"`. Uses Web Crypto
 * (`crypto.subtle`), available unchanged in both Node 20+ and every
 * browser, so this stays as runtime-agnostic as the rest of {@link resolveCourse}.
 */
export async function hashContent(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256-${hex}`;
}

/**
 * Compare `raw`'s actual hash against a declared `content_hash` value.
 * Returns `undefined` (nothing to check) when `expected` is malformed
 * rather than throwing — a schema-invalid `content_hash` is reported by
 * `validate()`, not here.
 */
export async function contentHashMatches(raw: string, expected: string): Promise<boolean | undefined> {
  if (!HASH_PATTERN.test(expected)) return undefined;
  return (await hashContent(raw)) === expected.toLowerCase();
}
