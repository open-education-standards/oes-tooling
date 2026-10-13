/**
 * Extract a playlist id from a YouTube playlist URL
 * (`https://www.youtube.com/playlist?list=PL...`, or a `watch?v=...&list=...`
 * URL), or accept a bare playlist id directly. Returns `undefined` if
 * neither shape matches.
 */
export function extractPlaylistId(input: string): string | undefined {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const list = url.searchParams.get("list");
    if (list) return list;
  } catch {
    // Not a URL — fall through to treat `trimmed` as a bare id.
  }
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return undefined;
}
