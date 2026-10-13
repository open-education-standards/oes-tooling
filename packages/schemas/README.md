# @inklyre/oes-schemas

The JSON Schemas for [OES](https://github.com/open-education-standards/oes) (Open Education Standards),
packaged for npm consumption.

## Building against a spec branch

`scripts/fetch-schemas.mjs` reads from `open-education-standards/oes@main` by default. When
a schema change is still on a branch, point it there instead:

```bash
OES_SPEC_REF=dev npm run fetch-schemas
```

Without this, a schema change on a branch cannot be built against until it
merges — which blocks the toolchain on the very merge the change is meant
to justify.

## How this package gets its content

Unlike this repo's other packages, this one has no local copy of its
source content to import — the spec repo (`oes`) is a separate repo, on
purpose (see `oes`'s README for why: keeping npm publish credentials out
of the repo that welcomes low-barrier outside contributions). Instead,
`scripts/fetch-schemas.mjs` downloads the current schema JSON directly
from `oes`'s `main` branch (public, no auth needed) into `vendor/`
(gitignored), and `src/index.ts` imports from there exactly like a local
file — esbuild inlines it at build time, so the *published* package needs
no network access at install or run time, only this package's own build
does.

`npm run fetch-schemas` runs automatically before `typecheck`/`test`/
`build` (via npm's `pre*` lifecycle hooks) — you don't need to run it by
hand, but you can if `vendor/` is stale or missing after a fresh clone.

## Install

```bash
npm install @inklyre/oes-schemas
```

## Usage

```ts
import { schemas, type DocumentType } from "@inklyre/oes-schemas";

schemas["ovf.video"].schema; // the raw video.json JSON Schema
```

Most consumers won't need this package directly — [`@inklyre/oes-core`](../core)
depends on it and does the actual validation/type work.

## Publishing

`.github/workflows/schemas-sync.yml` (in this repo, not `oes`) runs on a
daily schedule plus manual dispatch: it fetches the current schemas,
compares their hash against `.content-hash` (committed, updated on every
publish), and if they differ, bumps a patch version, runs the full
verification suite, publishes, and commits the new hash. Routine schema
edits reach this package automatically, without anyone manually running
`npm publish` — `oes` itself has no role in this beyond being a public
repo this workflow can read.

## License

CC BY 4.0, same as the schemas themselves — see `oes`'s `LICENSE-SPEC`.
