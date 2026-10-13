# @inklyre/oes-core

Types, schema validation, and reference resolution for [OES](https://github.com/open-education-standards/oes)
(Open Education Standards) content — the foundation every other OES tool
is meant to build on rather than reimplement.

## Install

```bash
npm install @inklyre/oes-core
```

## What this does

- **Types** — hand-written TypeScript types for all 7 specs (OCF, OPF,
  OQF, OAF, OVF, ORF, OPK), kept honest against the real JSON Schemas by a test suite that
  runs every fixture in this repo's `conformance/` through this package's
  own validator (`test/conformance.test.ts`) — a schema change with no
  matching type update fails that suite.
- **Validate** — one JSON Schema validator (`ajv`) per document type.
- **Bundle** — `bundlePackage()` turns an OPK package into its bundled
  payload: references become `ref` keys, prose is inlined, relative paths
  and links are rewritten relative to the bundle, answer keys are
  withheld, and the output is byte-identical on every run.
- **Digest** — `packageDigest()` computes an OPK package digest exactly as
  the spec defines it (the same result as the `sha256sum` one-liner in the
  spec).
- **Resolve** — walks a course/set's `path`/`*_url` references into one
  fully-resolved, validated tree, using a pluggable `ContentSource` so the
  exact same resolution logic runs from the local filesystem (a CLI, the
  desktop Studio app) or over HTTP (a browser LMS, the playground). Every
  reference's `content_hash`, where declared, is verified against the
  fetched content along the way — a mismatch is reported the same way a
  dangling reference is, via `ResolveError`, without failing the rest of
  the tree.
- **Prose is inlined.** After resolution, `statement`, an article's
  `content`, and a stimulus's `content` are **always strings**, never
  `{file: …}` references — so a consumer never fetches prose itself.
  Without this every consumer re-implements prose fetching, which is an
  N+1 fetch per question for any renderer. A `{file}` reference carrying
  a `content_hash` is verified here; that is the only place a separate
  prose file's bytes can be checked at all.
- **Multi-part groups are walked.** `resolveSet` descends into an OPF
  group entry's `parts`, so a consumer that ignores grouping still sees
  every part exactly once, in document order.

## Usage

```ts
import { validateOqfQuestion } from "@inklyre/oes-core";

const result = validateOqfQuestion(someJson);
if (result.valid) {
  // result.data is now typed as OqfQuestion, narrowed further by `type`
  console.log(result.data.title);
} else {
  console.error(result.errors);
}
```

```ts
import { fsSource, resolveCourse } from "@inklyre/oes-core";

const { data, errors } = await resolveCourse(fsSource("./my-course"));
// data: the full course → module → lesson → article/video/practice-set →
// question → stimulus tree, every document already schema-validated.
// errors: any broken reference along the way — resolution of everything
// else still completes; see ResolveError.
```

```ts
import { urlSource, resolveSet } from "@inklyre/oes-core";

// Same resolver, a URL-rooted source instead — works unchanged in a browser.
const { data, errors } = await resolveSet(
  urlSource("https://raw.githubusercontent.com/example/practice-set/main/")
);
```

## What this doesn't do

- **Referential-integrity linting beyond what `resolve` naturally checks**
  (e.g. duplicate `id`s across a whole tree, `answer_key` file existence
  independent of whether anything currently references it, `match`/`order`
  answer cross-references, pool `select` ≤ `from.length`) — that's
  [`@inklyre/oes-lint`](../lint), not this package. `resolve` only reports
  references it actually walked.
- **Rendering** — turning resolved content into UI is `@oes/renderer`'s
  job (planned), not this package's.
- **Progress, grading, or any runtime state** — deliberately out of scope
  for OES itself; see the Versioning & Conformance page's "Scope: content,
  not runtime state" section.
