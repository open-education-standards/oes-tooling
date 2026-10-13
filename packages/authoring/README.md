# @inklyre/oes-authoring

The `.oes.md` authoring format for OES questions — Markdown prose with YAML
frontmatter — and the compiler that turns it into canonical `question.json`.

Hand-written `question.json` remains the primary path and is fully
supported. This package is for authors who would rather write a question
than assemble one, and it is a **serializer, not a translator**: frontmatter
uses OQF's own field names, unchanged, so a field added to the spec works
here without a change to this package.

```bash
npm install @inklyre/oes-authoring
```

The CLI ships in [`@inklyre/oes-lint`](../lint):

```bash
npx @inklyre/oes-lint compile   ./questions          # .oes.md  -> question.json
npx @inklyre/oes-lint decompile ./questions          # question.json -> .oes.md
npx @inklyre/oes-lint compile   ./questions --check  # CI: fail if output is stale
```

## The format

```markdown
---
type: mcq
title: Binary search — time complexity
difficulty: easy
topics: [ algorithms, complexity ]
type_config:
  options:
    - { id: a, content: $O(1)$ }
    - { id: b, content: $O(\log n)$ }
  answer: b
explanation: Each comparison halves the search space.
---

What is the worst-case time complexity of binary search on `n` elements?
```

The body is the statement. Everything else is OQF, verbatim.

### Why the prose lives in the body

A statement written as a JSON string has to escape itself: `$O(\log n)$`
becomes `"$O(\\log n)$"`, and a single missed backslash is an invalid escape
that makes the whole document unparseable. In the body there is nothing to
escape — the compiler takes the text and `JSON.stringify` handles the rest,
which is a total function. This is the format's main reason to exist.

Math delimiters are deliberately **not** parsed. The statement is stored as
Markdown text and how `$…$` renders is the renderer's business.

### Fields you don't write

`$schema`, `oqf_version`, and `id` are supplied by the compiler — the first
two are constants it knows, and `id` defaults to the question's folder name,
already the OPF convention when referencing a question by `path`. Write any
of them explicitly and yours wins.

### Where the output goes

A source in an `authored/` folder compiles into its parent, so
`questions/binary-search/authored/question.oes.md` produces
`questions/binary-search/question.json` with id `binary-search`. A source
anywhere else compiles into its own folder and takes that folder's name.

### Long statements

Declare `statement: { file: statement.md }` and the body is written to that
file instead of being inlined. The author decides; the compiler never
guesses from length.

### Rich options

Options whose content is more than a phrase move into the body as blocks:

```markdown
:::option{id=a}
![All elements left of the pivot are smaller](assets/opt-a.png)
:::
```

`:::option` covers `mcq`/`msq`; `:::left` and `:::right` cover `match`;
`:::item` covers `order`. A `:::` inside a fenced code block is content, so
a question *about* this syntax is writable.

Decompiling lifts an option into a block when its content is multi-line,
contains an image, or contains a code fence — all-or-nothing per collection,
so a list of choices never mixes two styles. Content ending in a newline
stays inline: a `:::` block is delimited by lines and cannot represent its
own trailing blank lines, whereas a YAML block scalar can.

## Round-tripping

`decompileQuestion` is the direction that can lose information, so by
default it verifies itself — the result is compiled back and compared field
by field against the input, and any difference throws `RoundTripError`
instead of returning. A caller gets either a document that provably compiles
to what it started from, or an error, never a quietly damaged file.

This is not theoretical. Building it surfaced two real defects immediately:
a trailing newline dropped when reconstructing frontmatter (which YAML's
`|+` chomping indicator exists precisely to preserve), and rich option
content silently losing its trailing blank lines when lifted into a `:::`
block. Both were silent corruption of question content.

`test/roundtrip.test.ts` runs ~50 adversarial values — YAML 1.1
booleans-by-accident (`no`, `yes`, `on`, `off`), numeric coercion (`0x1F`,
`007`, `1.10`, `1:30`), whitespace the emitter could trim, every chomping
case, LaTeX with `\\` row breaks, and code fences — through every field that
takes free text.

## Frontmatter syntax

YAML is what this emits. YAML 1.2 is a superset of JSON, so `{ … }` flow
mappings parse with no extra code and no syntax sniffing — a generator that
finds JSON easier to emit can write JSON and this accepts it. Output is
always YAML, so the two can't drift into separate dialects.

The delimiter rule is stricter than most frontmatter libraries, because the
disagreement between them is silent: only a `---` on the very first line
opens frontmatter, and only the first subsequent line that is exactly `---`
closes it. Everything after that is body, untouched — a horizontal rule
inside a statement can never be mistaken for a delimiter.

CRLF is normalised to LF on the way in. YAML normalises line breaks inside
block scalars regardless, so a CRLF document could not round-trip byte-for-
byte no matter what this package did; doing it once, up front, makes a
Windows checkout behave identically to a POSIX one.

## API

```ts
import { compileQuestion, decompileQuestion } from "@inklyre/oes-authoring";

const { question, files } = compileQuestion(source, { id: "binary-search" });
// files: [{ path: "question.json", content }, ...a prose file, if declared]

const authored = decompileQuestion(question);  // throws RoundTripError on any loss
```

`compileFile`, `decompileFile`, `findAuthored`, and `findQuestions` add the
filesystem layer the CLI uses.

## License

Apache-2.0
