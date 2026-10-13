import type { Prose, Reference, RelatedItem, Source, Status } from "./common.js";

/** `article.json` — an individual written article (OAF v0.2.0). */
export interface OafArticle {
  oaf_version: string;
  id: string;
  title: string;
  /** The article's prose. Required — an article without a body is not an article. */
  content: Prose;
  description?: string;
  authors?: string[];
  license?: string;
  status?: Status;
  tags?: string[];
  language?: string;
  estimated_mins?: number;
  references?: Reference[];
  related?: RelatedItem[];
  source?: Source;
}
