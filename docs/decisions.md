# Design decisions

The main decisions behind the OES reference tooling. The specs themselves
live in [`oes`](https://github.com/open-education-standards/oes), which
has its own `docs/decisions.md`.

## Repository and licensing

**Separate from the spec repo.** The spec repo stays easy to contribute to
and holds no secrets. This repo holds the npm packages and the credentials
to publish them, and changes here are reviewed as code. Spec changes and
tooling releases move at their own pace.

**Apache 2.0.** Permissive so that anyone can build on the tooling,
including commercially, with an explicit patent grant. Adoption of the
format matters more than restricting who uses the tools.

**Published under the `@inklyre` npm scope.** The bare `@oes` scope is
unavailable. The CLI scaffold is unscoped (`create-oes`) because that is
what `npm create oes` requires.

## How the packages fit together

**Everything builds on `@inklyre/oes-core`.** Types, `validate()` and
`resolve()` live in one package, and every other tool wraps it rather than
re-implementing tree-walking or validation. The first downstream tool
(the linter) proved the pattern: most of its checks reuse what `resolve()`
already found.

**Schemas come from the spec repo, not a copy.** `@inklyre/oes-schemas`
fetches the current schema files from the spec repo at build time, and a
daily workflow publishes a new patch when they change. `fetch-schemas`
compares its list with the spec repo's own record of current schemas and
fails if they disagree, so a new or bumped schema can't be silently left
out.

**Hand-written types, kept honest by conformance tests.** The TypeScript
types are written by hand for readability. `oes-core` runs the spec's
conformance fixtures through its own validator, so a schema change with no
matching type change fails a test instead of going unnoticed.

**Builds run in dependency order.** Packages depend on each other through
the workspace, so `npm run build` builds them in topological order, and
each package's CI builds exactly the packages it depends on.

## Behaviour of the core library

**One content-source abstraction.** `resolve()` reads through a
`ContentSource`, so the same code works over HTTP, the filesystem or
anything else, and runs unchanged in a browser or in Node. Hashing uses
Web Crypto for the same reason.

**`resolve()` verifies hashes and inlines prose.** It already fetches every
referenced document, so it is the one place a `content_hash` can be
checked for free. After resolution, prose fields are always strings, so no
consumer has to fetch prose itself (which would otherwise cost one request
per question).

**`resolve()` never touches answer keys.** It is meant to be safe for a
learner-facing app to call directly, and an answer key exists precisely so
that such an app can't reach the answer. Checking that an answer-key file
exists is therefore the linter's job, an author-side tool run before
publishing.

## Tools

**One CLI, `oes`, with subcommands** (`lint`, `compile`, `decompile`,
`import`), rather than a separate binary per tool.

**The authoring format is a serializer, not a second spec.**
`@inklyre/oes-authoring`'s Markdown-plus-YAML format uses the spec's own
field names, so a new spec field works with no compiler change. It is
versioned as software, not as a spec. It round-trips exactly in both
directions (`compile --check` and `decompile --check`), and decompiling
checks its own output and refuses to write anything that would not
compile back to the input.

**The renderer is headless.** `@inklyre/oes-renderer` takes already-resolved
data, ships no CSS and does no fetching, so it fits into any app's design
and data layer.

**Importers share one CLI shell.** `oes import <source>` is the pattern; the
YouTube importer is the first source, and others reuse the same shell.

## Roadmap

- Renderer components for all question types.
- The conformance fixtures published as their own package, so any
  implementation in any language can test against the same cases (and the
  copy in `packages/core/test/fixtures/` goes away).
- A hosted playground: paste a document, see it validate and render.
