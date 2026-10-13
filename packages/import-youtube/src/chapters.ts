export interface ExtractedChapter {
  label: string;
  time_seconds: number;
}

// Matches a line starting with a timestamp ("0:00", "12:34", "1:02:03")
// followed by whitespace and a label — the format YouTube itself
// recognizes for auto-generated chapters in a video description.
const TIMESTAMP_LINE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+[-–—:]?\s*(.+?)\s*$/;

function toSeconds(hours: string | undefined, minutes: string, seconds: string): number {
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Extract chapter markers from a video's description, matching YouTube's
 * own convention for description-based chapters. Requires at least two
 * timestamp lines and the first at 0:00 — the same bar YouTube itself
 * uses to decide a description contains real chapters rather than one
 * incidental timestamp mentioned in passing (e.g. "see 4:20 in the demo").
 */
export function extractChapters(description: string): ExtractedChapter[] {
  const chapters: ExtractedChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match = TIMESTAMP_LINE.exec(line);
    if (!match) continue;
    const [, hours, minutes, seconds, label] = match;
    if (!label) continue;
    chapters.push({ label, time_seconds: toSeconds(hours, minutes, seconds) });
  }
  if (chapters.length < 2 || chapters[0].time_seconds !== 0) return [];
  return chapters;
}
