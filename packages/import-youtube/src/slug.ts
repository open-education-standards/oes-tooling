const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Kebab-case a title for use as an OES `id` fragment — lowercase
 * `[a-z0-9]+(-[a-z0-9]+)*`, the pattern every OES id field requires.
 * Truncates so an id built from `${slugify(title)}-${shortHash(...)}`
 * stays a reasonable length even for a long video title.
 */
export function slugify(title: string, maxLength = 48): string {
  const slug = title
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "") // strip combining diacritics left behind by NFKD, e.g. "é" -> "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

/**
 * An 8-hex-char digest of `seed`, for disambiguating ids derived from a
 * title slug (which alone isn't guaranteed unique) while staying inside
 * the `[a-z0-9-]` id pattern — unlike a raw YouTube video id, which
 * routinely contains uppercase letters and underscores.
 */
export async function shortHash(seed: string): Promise<string> {
  const bytes = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A stable, valid OES id derived from a human title plus a unique seed (e.g. a YouTube video/playlist id). */
export async function deriveId(title: string, seed: string, fallback: string): Promise<string> {
  const base = slugify(title) || fallback;
  return `${base}-${await shortHash(seed)}`;
}
