# @inklyre/oes-renderer

React components that render [OES](https://github.com/open-education-standards/oes)
content. Questions of every type, articles, video lessons (including YouTube) and
course outlines, plus OES-flavoured Markdown with maths.

## Install

```bash
npm install @inklyre/oes-renderer
```

`react` (18 or 19) is a peer dependency — bring your own.

## Design

- **Headless.** Every component renders semantic HTML with stable
  `oes-*` className hooks (`oes-video-player__video`,
  `oes-course-outline__item--video`, …) and ships no CSS. Style it
  however your product already styles things — this library never
  imposes a visual design.
- **Already-resolved data in, no fetching.** Components take the plain
  objects [`@inklyre/oes-core`](../core)'s `resolve()` already produces
  (`OvfVideo`, `ResolvedCourse`) as props. Rendering and data-fetching
  stay separate, so these components work the same in Node/SSR, tests,
  and the browser regardless of how you fetched/resolved the content.

## Markdown and maths

Prose renders through `<Markdown>`, following OES's Markdown Conventions:
CommonMark plus GFM tables, strikethrough and task lists, with `$…$` and
`$$…$$` maths tokenised before inline Markdown (so `_` and `\\` inside
maths are never mangled). Raw HTML is not rendered, and unsafe link
schemes are removed. Maths uses KaTeX: include its stylesheet yourself,
e.g. `import "katex/dist/katex.min.css"`.

Every component that renders prose takes an optional `resolveUrl`, which
turns a relative image or link URL into a loadable one (for example,
against the URL of the bundle the content came from).

## `<QuestionView>`

Renders any of OQF's 11 question types: stimulus, statement, hints, an
input for the learner's response, and, once you pass `result`, feedback
and the explanation. It is controlled: keep the response in your own
state, and check it with `checkResponse()` from `@inklyre/oes-core`.

```tsx
const [response, setResponse] = useState<QuestionResponse>();
const [result, setResult] = useState<CheckResult>();

<QuestionView question={q} response={response} onResponse={setResponse} result={result} />
<button onClick={() => setResult(checkResponse(q, response))}>Check</button>
```

Fill-in-the-blank markers (`{{b1}}`) become inputs in place, ordering
uses up/down buttons rather than drag and drop, and shuffled options stay
in the same order for a given `shuffleSeed`. Secured questions, `code`,
and person-graded types say why they can't be checked in the browser.

## `<ArticleView>`

Renders an article's title and Markdown body. `content` must already be a
string, as `resolve()` and bundles guarantee.

## `<VideoPlayer>`

```tsx
import { VideoPlayer } from "@inklyre/oes-renderer";

<VideoPlayer video={resolvedVideoLesson.video} />;
```

Renders the video (a privacy-enhanced YouTube embed for YouTube URLs, otherwise `<video src={video_url}>`), a chapter list that seeks
the player on click when `video.chapters` is present, and a `<track>`
per caption — but only for `captions[].url` entries. A `path` caption is
relative to that video's own `video.json` and has no meaning without the
`ContentSource` that resolved it, which this component never sees by
design; resolve a `path` caption to an absolute URL yourself first if you
need it rendered. Pass `videoProps` to override or extend the underlying
`<video>` element's attributes (`autoPlay`, `muted`, `className`, …).

## `<CourseOutline>`

```tsx
import { CourseOutline } from "@inklyre/oes-renderer";
import { resolveCourse, fsSource } from "@inklyre/oes-core";

const { data: course } = await resolveCourse(fsSource("./my-course"));

<CourseOutline
  course={course}
  activeItemId={currentItemId}
  onSelectItem={(item, { module, lesson }) => navigate(item.ref.id)}
/>;
```

Renders the full course → module → lesson → item hierarchy as nested
`<nav>`/`<ol>`/`<li>`/`<button>` markup. `activeItemId` adds
`data-active="true"` to the matching item's `<li>` and
`aria-current="true"` to its button; `onSelectItem` fires on click with
the item and its owning module/lesson for context. An item's display
title is its own `ref.title` when set, falling back to the resolved
content's own `title` otherwise.
