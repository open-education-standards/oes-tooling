// Schemas are fetched from the spec repo (github.com/open-education-standards/oes) into
// vendor/ by scripts/fetch-schemas.mjs (run automatically before
// typecheck/test/build via npm's pre* lifecycle hooks) and imported here
// exactly like a local file — esbuild inlines the JSON at build time, so
// the published package needs no runtime fetch and no filesystem access
// to the spec repo. Run `npm run fetch-schemas` after cloning if vendor/
// is empty.
import oafArticleSchema from "../vendor/oaf/v0.2.0/article.schema.json";
import ocfCourseSchema from "../vendor/ocf/v0.3.0/course.schema.json";
import opfSetSchema from "../vendor/opf/v0.3.0/set.schema.json";
import opkHubPackageSchema from "../vendor/opk/v0.2.0/hub-package.schema.json";
import opkHubSchema from "../vendor/opk/v0.2.0/hub.schema.json";
import opkPackageSchema from "../vendor/opk/v0.2.0/package.schema.json";
import oqfQuestionSchema from "../vendor/oqf/v0.2.0/question.schema.json";
import oqfStimulusSchema from "../vendor/oqf/v0.2.0/stimulus.schema.json";
import orfResourceSchema from "../vendor/orf/v0.1.0/resource.schema.json";
import ovfVideoSchema from "../vendor/ovf/v0.1.0/video.schema.json";

export const schemas = {
  "oaf.article": { schema: oafArticleSchema },
  "ovf.video": { schema: ovfVideoSchema },
  "orf.resource": { schema: orfResourceSchema },
  "oqf.question": { schema: oqfQuestionSchema },
  "oqf.stimulus": { schema: oqfStimulusSchema },
  "opf.set": { schema: opfSetSchema },
  "opk.package": { schema: opkPackageSchema },
  "opk.hub": { schema: opkHubSchema },
  "opk.hub-package": { schema: opkHubPackageSchema },
  // OCF is one schema file covering three document types via #/definitions/{name}.
  "ocf.course": { schema: ocfCourseSchema, definition: "course" },
  "ocf.module": { schema: ocfCourseSchema, definition: "module" },
  "ocf.lesson": { schema: ocfCourseSchema, definition: "lesson" },
} as const;

export type DocumentType = keyof typeof schemas;
