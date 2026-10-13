# @inklyre/oes-renderer

React components that render [OES](https://github.com/open-education-standards/oes)
content. Starting scope, matching what the YouTube importer already
produces: a video lesson and a course outline. More content types and
OQF's question types follow.

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

## `<VideoPlayer>`

```tsx
import { VideoPlayer } from "@inklyre/oes-renderer";

<VideoPlayer video={resolvedVideoLesson.video} />;
```

Renders the video (`<video src={video_url}>`), a chapter list that seeks
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
