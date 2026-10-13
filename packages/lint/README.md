# @inklyre/oes-lint

Referential-integrity linting for [OES](https://github.com/open-education-standards/oes) content, built on
[`@inklyre/oes-core`](../core)'s `resolve()` rather than reimplementing a
second tree-walker.

## Install

```bash
npm install -D @inklyre/oes-lint
```

## CLI

```bash
npx oes lint ./my-course
npx oes lint ./my-set --entry set.json
npx oes lint ./my-course --json   # machine-readable output, e.g. for a GitHub Action
```

Exits `0` when no `"error"`-severity issue is found, `1` otherwise. The
entry document (`course.json`/`set.json`/`module.json`/`lesson.json`) is
auto-detected from the given directory unless `--entry` is passed.

## GitHub Action

Since OES content lives in git, lint-on-every-PR is a near-zero-friction
way to keep a course/set repo trustworthy. Any repo can use this one's
composite action without installing anything first:

```yaml
# .github/workflows/lint.yml, in a course/set repo (not this one)
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: open-education-standards/oes-tooling/.github/actions/lint@main
        with:
          path: ./my-course
```

## What it checks

Everything `resolve()` already catches while walking the tree:

- **Dangling references** — a `path`/`*_url` that doesn't resolve, or a
  document that fails schema validation.
- **`content_hash` mismatches** — a declared hash that doesn't match the
  referenced document's actual content.

Plus checks that need a whole-tree or single-document view `resolve()`
doesn't attempt on its own:

- **Duplicate ids** — within any array addressed by `id`: `course.modules`,
  a module's `lessons`, a lesson's `articles`/`video_lessons`/`practice_sets`,
  a set's `questions`, a pool's `from`, and every question type's own
  id-bearing array (`options`, `left`/`right`, `items`, `blanks`,
  `test_cases`, `labels`) — including ids buried inside multi-part group
  `parts`, which must be unique across the whole set rather than just
  among siblings.
- **Multi-part group structure** — `answer_any` exceeding the number of
  parts (error); a single-part group, nesting past two levels, and parts
  of one group referencing **different stimuli** (warnings). That last
  one matters because a group's shared stem lives on each part's own
  question rather than on the group, so a mismatch is invisible in
  `set.json` and easy to introduce by copying a part.
- **Pool `select` bounds** — a pool's `select` must be between 1 and
  `from.length`; not expressible in JSON Schema since it relates two
  sibling fields.
- **Dangling answer cross-references** — an `mcq`/`msq` `answer`(s), a
  `match` pair's `left_id`/`right_id`, or an `order`'s `correct_order`
  pointing at an id that doesn't exist in the corresponding option array.
  Only checked in self-practice mode: a secured `answer_key` means there's
  no inline answer to check.
- **`answer_key.file` existence** — checked directly by this package, not
  by `resolve()`, which deliberately never fetches `answer_key` content at
  all: a public/student-facing consumer built on
  `resolveCourse`/`resolveSet` must never gain a path to the answer through
  the shared resolver.

## Programmatic API

```ts
import { fsSource } from "@inklyre/oes-core";
import { lintCourse } from "@inklyre/oes-lint";

const { issues, ok } = await lintCourse(fsSource("./my-course"));
```

`lintSet`, `lintLesson`, and `lintModule` are the equivalent entry points
for linting a smaller subtree in isolation (e.g. a set-only repo, or an
authoring tool previewing one lesson).

## What this doesn't do

- **Grading, or anything answer-key-content-aware beyond existence** —
  this package checks the file exists, never what's inside it.
- **Anything `resolve()` doesn't already cover as a side effect of
  walking the tree** — this package adds checks, it doesn't re-implement
  reference resolution.
