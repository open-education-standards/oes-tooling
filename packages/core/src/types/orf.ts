import type { Reference, RelatedItem, Source, Status } from "./common.js";

export interface OrfTocEntry {
  label: string;
  page: number;
}

/**
 * `resource.json` — a reference document (a PDF, an ebook, a paper,
 * slides) in the Open Resource Format (ORF v0.1.0). Distinct from OAF:
 * an ORF resource is a document OES doesn't own or render as prose — a
 * genuine written article always belongs in OAF instead.
 */
export interface OrfResource {
  orf_version: string;
  id: string;
  title: string;
  description?: string;
  authors?: string[];
  license?: string;
  document_url: string;
  page_count?: number;
  /**
   * Author-set legal/rights flag. Only `true` for self-hosted or
   * appropriately-licensed content — never for a third-party-hosted
   * file where mirroring it would violate that source's terms.
   */
  downloadable?: boolean;
  /** Populated by tooling, not hand-authored — present only once an app has actually downloaded a `downloadable: true` document for offline reading. */
  local_path?: string;
  status?: Status;
  tags?: string[];
  language?: string;
  /** Page-anchored sections, so a consuming app can build real chapter navigation instead of a raw page-by-page scroll. */
  toc?: OrfTocEntry[];
  references?: Reference[];
  related?: RelatedItem[];
  source?: Source;
}
