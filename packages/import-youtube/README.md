# @inklyre/oes-import-youtube

Converts a YouTube playlist into [OES](https://github.com/open-education-standards/oes) content: one
OCF module (the playlist), one lesson per video, each lesson holding
exactly that video as its `items[]` entry — plus the corresponding OVF
`video.json` for each one. Library only; the `oes import youtube` CLI
built on this lives in [`@inklyre/oes-lint`](../lint), which anticipated
growing into a general `oes` binary from the start.

## Install

```bash
npm install -D @inklyre/oes-import-youtube
```

## CLI (via `@inklyre/oes-lint`'s `oes` binary)

```bash
# Fetch + plan + generate in one step
YOUTUBE_API_KEY=... npx oes import youtube "https://www.youtube.com/playlist?list=PL..."

# Two-phase: write an editable plan, review/hand-edit it, then generate
npx oes import youtube "https://www.youtube.com/playlist?list=PL..." --plan plan.json
npx oes import youtube --from-plan plan.json --out ./my-module

# Regenerate later, once the playlist has changed — safe without --force,
# since the output directory is recognized as this importer's own
npx oes import youtube "https://www.youtube.com/playlist?list=PL..." --out ./my-module
```

An API key is required for any command that fetches from YouTube (not
`--from-plan`): pass `--api-key <key>` or set `YOUTUBE_API_KEY`.

## Why a plan, not just direct generation

A playlist alone carries no signal about module/lesson boundaries beyond
"here are N videos in order" — the default strategy (one module for the
whole playlist, one lesson per video) is a reasonable default, not a
universally correct one. Rather than trying to make an automatic
heuristic guess right for every playlist shape, `--plan` writes the
proposed module/lesson/video mapping as plain, readable JSON you can
hand-edit (retitle a lesson, reorder or drop entries) before
`--from-plan` turns it into real OES files — no JSON-Schema knowledge
required, just edit `title`/order in the plan.

## Stable ids across re-runs

Every generated `id` is derived from the video's own YouTube video id
(via a short hash), not from its position in the playlist — inserting a
new video mid-playlist and re-running the import doesn't renumber or
break anything already referencing an existing lesson/video id.

## Regeneration is a full overwrite

`generateFromPlan`/`--out` treats its target directory's `lessons/`
subtree as fully owned, generated output: every call replaces it
entirely, so a video removed from the source playlist has its lesson
folder deleted, and any manual edits made directly to a previously
generated `lesson.json`/`video.json` are lost. Don't hand-edit inside a
directory this importer manages — edit the plan instead, or treat the
output as a starting point you move elsewhere once you're done adjusting
it.

As a safety net, generation refuses to write into an existing directory
unless its `module.json` was itself produced by this importer
(`source.platform === "YouTube"`), or `--force`/`{ force: true }` is
passed — so pointing `--out` at the wrong folder by mistake can't
silently destroy something unrelated.

## What gets extracted

- Playlist title/description → the module's `title`/`description`.
- Each video's title/description/duration → the lesson's video.
- Description timestamps in YouTube's own chapter format (`0:00 Label`,
  starting at `0:00`, at least two entries) → OVF `chapters[]`.
- `source.platform: "YouTube"` on every generated document, plus the
  originating URL and fetch date — the same provenance convention every
  OES importer is expected to record.

Deleted/private videos still listed in the playlist (no details returned
by the API) are skipped, not treated as a fatal error for the whole
import. The generated `video.json` never sets `downloadable`/`local_path`
— those are reserved for content the platform holds redistribution
rights to, which an embedded third-party YouTube video never is.

## Programmatic API

```ts
import { fetchYoutubePlaylist, planYoutubeImport, generateFromPlan } from "@inklyre/oes-import-youtube";

const playlist = await fetchYoutubePlaylist(playlistUrl, apiKey);
const plan = await planYoutubeImport(playlist);
// ...optionally inspect/edit `plan` here...
const result = await generateFromPlan(plan, "./my-module");
```

This is also the intended integration point for a future UI (e.g. OES
Studio's planned "paste a URL, then organize visually" import flow) —
`planYoutubeImport`'s output is plain, editable data, not tied to the
CLI's `--plan` file format specifically.
