# oes-tooling

Reference tooling for [OES (Open Education Standards)](https://github.com/open-education-standards/oes) —
types, schema validation, reference resolution, referential-integrity
linting, and content importers, all built on the spec defined in the
[`oes`](https://github.com/open-education-standards/oes) repo.

This repo is licensed under [Apache 2.0](./LICENSE) — separate from the
spec repo, which licenses the specifications themselves (schemas, docs)
under CC BY 4.0. See `oes`'s README for the reasoning behind keeping the
spec and its reference tooling in separate repos.

## Packages

| Package | What it is |
|---|---|
| [`packages/schemas`](./packages/schemas) — [`@inklyre/oes-schemas`](https://www.npmjs.com/package/@inklyre/oes-schemas) | The JSON Schemas for OES, fetched from the `oes` spec repo and packaged for npm. |
| [`packages/core`](./packages/core) — [`@inklyre/oes-core`](https://www.npmjs.com/package/@inklyre/oes-core) | Types, `validate()`, and `resolve()` for every OES document type. Everything else here builds on this. |
| [`packages/lint`](./packages/lint) — [`@inklyre/oes-lint`](https://www.npmjs.com/package/@inklyre/oes-lint) | Cross-file referential-integrity linting (dangling references, duplicate ids, `content_hash` mismatches, and more), plus the `oes` CLI. |
| [`packages/authoring`](./packages/authoring) — [`@inklyre/oes-authoring`](https://www.npmjs.com/package/@inklyre/oes-authoring) | The `.oes.md` authoring format for questions — Markdown prose with YAML frontmatter — and the compiler both ways. Wired into the `oes` CLI's `compile`/`decompile` subcommands. Hand-written `question.json` remains fully supported; this is an alternative, not a replacement. |
| [`packages/import-youtube`](./packages/import-youtube) — [`@inklyre/oes-import-youtube`](https://www.npmjs.com/package/@inklyre/oes-import-youtube) | Converts a YouTube playlist into OES content (an OCF module + one lesson per video, OVF video lessons) via the YouTube Data API. Wired into the `oes` CLI's `import youtube` subcommand. |
| [`packages/create-oes`](./packages/create-oes) — [`create-oes`](https://www.npmjs.com/package/create-oes) | Scaffolds a minimal, valid OES course (one course/module/lesson/set/question) via `npm create oes`. Unscoped on purpose — that's what the `npm create oes` shorthand requires. |
| [`packages/renderer`](./packages/renderer) — [`@inklyre/oes-renderer`](https://www.npmjs.com/package/@inklyre/oes-renderer) | Headless React components rendering OES content — a video lesson and a course outline to start. Takes already-resolved data from `@inklyre/oes-core`; no bundled CSS, no fetching. |

`packages/schemas` is unlike the others: `oes` (the spec repo) has no
publish pipeline of its own, on purpose — publish credentials don't
belong in the repo that welcomes low-barrier outside contributions.
Instead, `.github/workflows/schemas-sync.yml` here polls `oes` on a daily
schedule and publishes a new patch of `@inklyre/oes-schemas` when its
schema content changes. `packages/core` depends on it like a normal npm
package. See `packages/schemas`'s own README for the full mechanism.

## Building against a spec branch

`@inklyre/oes-schemas` vendors its schemas from `inklyre/oes@main`. When a
schema change is still on a branch, point every build at it:

```bash
OES_SPEC_REF=dev npm run build
OES_SPEC_REF=dev npm run test --workspaces
```

Without this, a schema change on a branch cannot be built against until it
merges — which blocks the toolchain on the very merge the change is meant
to justify.

## Getting started

```bash
npm install
npm run build
npm run test --workspaces
```

Use `npm run build`, not `npm run build --workspaces`: packages here depend
on each other through the workspace, and `--workspaces` builds them in
directory order, so on a fresh clone `authoring` builds before the `core`
it imports and fails. `npm run build` builds in dependency order.

## CLI

```bash
npm create oes my-course
npx oes lint ./my-course
npx oes compile ./my-course/sets/quiz-1     # .oes.md -> question.json
npx oes decompile ./my-course/sets/quiz-1   # question.json -> .oes.md
npx oes import youtube "https://www.youtube.com/playlist?list=..." --api-key <key>
```

See each package's own README for details.
