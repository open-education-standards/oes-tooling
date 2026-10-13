import type { Reference, RelatedItem, Source, Status } from "./common.js";
import type { ExactlyOne } from "./util.js";

export interface OvfChapter {
  label: string;
  time_seconds: number;
}

/** A timed caption track for one language. */
export type OvfCaption = {
  language: string;
  content_hash?: string;
} & ExactlyOne<{ path: string; url: string }>;

/** `video.json` — an individual video lesson (OVF v0.1.0). */
export interface OvfVideo {
  ovf_version: string;
  id: string;
  title: string;
  description?: string;
  authors?: string[];
  license?: string;
  video_url: string;
  duration_mins?: number;
  /**
   * Author-set legal/rights flag. Only `true` for self-hosted or
   * appropriately-licensed video — never for a third-party embed (e.g. a
   * YouTube URL), where mirroring the file would violate that platform's
   * terms.
   */
  downloadable?: boolean;
  /**
   * Populated by tooling, not hand-authored — present only once an app has
   * actually downloaded a `downloadable: true` video for offline playback.
   */
  local_path?: string;
  status?: Status;
  tags?: string[];
  language?: string;
  chapters?: OvfChapter[];
  references?: Reference[];
  related?: RelatedItem[];
  captions?: OvfCaption[];
  source?: Source;
}
