const ISO8601_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/**
 * Parse a YouTube `contentDetails.duration` value (ISO 8601, e.g.
 * `"PT1H2M3S"`) into whole seconds. Returns `undefined` for a value that
 * doesn't match the expected shape (e.g. a live stream reports `"P0D"`)
 * rather than throwing, so one odd video doesn't abort an entire import.
 */
export function parseIso8601Duration(value: string): number | undefined {
  const match = ISO8601_DURATION.exec(value);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined) return undefined;
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}
