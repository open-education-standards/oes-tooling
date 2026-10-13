import type { Source } from "./common.js";

/** The document types a package's entry, and a hub listing, can name. */
export type OpkEntryType = "course" | "set" | "article" | "video" | "resource";

/** Conformance profiles a package can require of a consumer. */
export type OpkProfile = "Core" | "+Media" | "+Practice" | "+Graded" | "+code" | "+submission";

export interface OpkFileEntry {
  /** Relative to the package root. Never escapes it. */
  path: string;
  /** Hex SHA-256 of the file's bytes. */
  sha256: string;
  bytes: number;
}

/**
 * `package.json` — the manifest of a shareable unit of OES content in the
 * Open Package Format (OPK v0.2.0).
 */
export interface OpkPackage {
  opk_version: string;
  /** `{namespace}/{package}`, both kebab-case. */
  name: string;
  /** SemVer for the package's content. */
  version: string;
  title: string;
  description?: string;
  authors?: string[];
  license?: string;
  tags?: string[];
  language?: string;
  /** The OES release this package was authored against. */
  oes_version?: string;
  /** The document a consumer opens first. */
  entry: { type: OpkEntryType; path: string };
  requires?: { profiles?: OpkProfile[] };
  /** `{ "{namespace}/{package}": "{semver range}" }` — releases, not locations. */
  dependencies?: Record<string, string>;
  /** `sha256-{hex}` over the canonical file listing. Added at publish time. */
  digest?: string;
  /** The manifest. Added at publish time. */
  files?: OpkFileEntry[];
  source?: Source;
}

export interface OpkBundleAsset {
  id: string;
  /** Absolute, or relative to the bundle's own URL. */
  url: string;
  sha256?: string;
  bytes?: number;
}

/**
 * A bundled payload: one package's content in a single response, with
 * every reference resolved, all prose inlined, and shared documents stored
 * once under a `{type}:{id}` key. Assets stay as URLs.
 */
export interface OpkBundle {
  opk_version: string;
  kind: "bundle";
  package: { name: string; version: string; digest: string };
  generated_from?: { oes_version?: string };
  entry: { type: OpkEntryType; id: string };
  /** Keyed `{type}:{id}`, e.g. `"question:two-sum"`. */
  documents: Record<string, unknown>;
  assets?: OpkBundleAsset[];
}

/** One package as listed in a hub's `index.json`. */
export interface OpkHubPackageSummary {
  name: string;
  title: string;
  description?: string;
  entry_type?: OpkEntryType;
  tags?: string[];
  /** The highest version that isn't yanked. */
  latest: string;
  /** The package's hub package document, relative to `index.json` or absolute. */
  url: string;
}

/**
 * `index.json` — the entry document of an OES hub: static files, served
 * over HTTPS, listing packages anyone can browse and import (OPK v0.2.0).
 */
export interface OpkHub {
  opk_version: string;
  kind: "hub";
  hub: { title: string; description?: string; homepage?: string };
  /** Absolute `https://` URL of the hub's new `index.json`, once it has moved. */
  moved_to?: string;
  packages: OpkHubPackageSummary[];
}

export interface OpkPublishedVersion {
  version: string;
  /** Equal to the version's manifest `digest`. Never changes once published. */
  digest: string;
  /** `YYYY-MM-DD`. */
  published_at?: string;
  /** The version's `package.json`, relative to this document or absolute. */
  manifest: string;
  /** The version's bundled payload, relative to this document or absolute. */
  bundle: string;
  /** Still fetchable, but hidden from browsing and never chosen for a new import. */
  yanked?: boolean;
  yanked_reason?: string;
}

/** A hub package document: every version of one package on a hub. */
export interface OpkHubPackage {
  opk_version: string;
  kind: "hub-package";
  name: string;
  versions: OpkPublishedVersion[];
}
