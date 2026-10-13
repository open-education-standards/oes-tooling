import type { ExactlyOne } from "./util.js";

/**
 * A Markdown prose field, held inline or pointed at a sibling file.
 *
 * The same shape everywhere OES carries prose — OQF's `statement`, OAF's
 * `content`, an OQF stimulus's `content`. Choose by reviewability rather
 * than length: prose you would want to review line by line belongs in a
 * file. Prefer the inline form for anything referenced by URL, since a
 * `content_hash` over the referencing document does not cover a separate
 * file's bytes unless that file carries its own.
 */
export type Prose = string | ProseFile;

export interface ProseFile {
  /** Path relative to the owning document's folder. */
  file: string;
  content_hash?: string;
}

/** Narrow a {@link Prose} value to its file-reference form. */
export function isProseFile(prose: Prose): prose is ProseFile {
  return typeof prose === "object" && prose !== null && typeof prose.file === "string";
}

/** Content lifecycle stage. Absent is equivalent to `"published"`. */
export type Status = "draft" | "published" | "deprecated";

/**
 * A cited source or further-reading pointer. The simple case is a bare URL
 * string; the richer object form is what lets a source with no single URL —
 * a print-only book (`isbn`), a paper (`doi`) — be cited at all.
 */
export type Reference = string | ReferenceObject;

export interface ReferenceObject {
  title: string;
  type?: "article" | "book" | "paper" | "video" | "website" | "dataset" | "other";
  authors?: string[];
  /** Omit for a source with no online location — isbn/publisher/year identify it instead. */
  url?: string;
  isbn?: string;
  doi?: string;
  publisher?: string;
  year?: number;
  note?: string;
}

/**
 * A suggested piece of material for the learner to explore further —
 * distinct from a {@link Reference}, which documents this content's own
 * sources rather than suggesting where to go next. Addressed either as an
 * OES-native pointer (exactly one of `path` or one of the `*_url` fields)
 * or as a fully external `url` for material not modeled as OES content.
 */
export type RelatedItem = {
  title: string;
  type: "video" | "article" | "book" | "course" | "practice_set" | "resource" | "file" | "link" | "other";
  content_hash?: string;
  note?: string;
} & ExactlyOne<{
  path: string;
  video_lesson_url: string;
  article_url: string;
  set_url: string;
  course_url: string;
  resource_url: string;
  url: string;
}>;

/**
 * Where a document was originally sourced or adapted from, if it wasn't
 * authored directly for OES — e.g. produced by an importer against
 * another platform's content. Entirely optional; omit for content
 * authored directly. Distinct from a document's own top-level `license`
 * (where present), which describes the OES document's own license, not
 * what it was adapted from — the original may be more restrictive, and
 * belongs in `Source.license` instead.
 */
export interface Source {
  url: string;
  /** Free-text label for the originating platform or site, e.g. "YouTube". Deliberately not an enum. */
  platform?: string;
  /** The ORIGINAL content's license/terms at the source. Free text, not constrained to SPDX. */
  license?: string;
  /** When this content was fetched/adapted from the source, formatted as an ISO 8601 date (e.g. "2026-09-06"). */
  retrieved_at?: string;
  note?: string;
}
