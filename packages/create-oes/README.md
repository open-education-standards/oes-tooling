# create-oes

Scaffolds a minimal, valid [OES](https://github.com/open-education-standards/oes) course —
one course, one module, one lesson, one practice set, one question, every
level the OCF hierarchy requires and nothing more — so a new author's
first five minutes produce something real and lint-clean instead of a
blank schema to decode.

## Usage

```bash
npm create oes my-course
# or
npx create-oes my-course
```

```
my-course/
├── course.json
└── modules/
    └── intro/
        ├── module.json
        └── lessons/
            └── welcome/
                ├── lesson.json
                └── practice-sets/
                    └── quiz/
                        ├── set.json
                        └── questions/
                            └── example-question.json
```

Flags:

```
npm create oes [target-dir] [--id <id>] [--title <title>] [--author <name>]...
               [--license <spdx>] [--force] [--json]
```

- `target-dir` — where to write the scaffold. Defaults to the current
  directory.
- `--id` — the course's `id`. Defaults to a kebab-case slug of `--title`.
- `--title` — the course's `title`. Defaults to `"My Course"`.
- `--author` — repeatable, appends to the course's `authors[]`. Omitted
  entirely (not an empty array) when not passed.
- `--license` — an SPDX identifier for the course's `license`. Omitted
  when not passed.
- `--force` — write into `target-dir` even if it already exists and isn't
  empty. Without this, generation refuses to touch a non-empty directory,
  so a mistyped `target-dir` can't silently clobber something else.
- `--json` — machine-readable output instead of the human summary.

Every generated document carries a `$schema` field pointing at its
current JSON Schema, so opening any of them in an editor with JSON Schema
support gets inline validation/autocomplete for free — see
[Editor Setup](https://open-education-standards.github.io/oes/editor-setup).

After writing files, the CLI runs [`@inklyre/oes-lint`](../lint)'s
`lintCourse` against the output before reporting success — the same
referential-integrity bar hand-authored content is held to, not just that
each document individually passed schema validation during generation.

## Library

The generator is also usable directly, e.g. from a future Studio "new
course" flow:

```ts
import { generateScaffold } from "create-oes";

const result = await generateScaffold({
  outDir: "./my-course",
  id: "my-course",
  title: "My Course",
});
```

`buildScaffold` is the pure, filesystem-free half — given the same
options, it returns the file tree as `{ path, content }[]` without
writing anything, useful for previewing or testing.
