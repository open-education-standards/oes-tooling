import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { schemas, type DocumentType } from "./schemas.js";
import type { OafArticle } from "./types/oaf.js";
import type { OcfCourse, OcfLesson, OcfModule } from "./types/ocf.js";
import type { OpfSet } from "./types/opf.js";
import type { OqfQuestion, OqfStimulus } from "./types/oqf.js";
import type { OrfResource } from "./types/orf.js";
import type { OvfVideo } from "./types/ovf.js";

export interface ValidationResult<T> {
  valid: boolean;
  /** `null` when `valid` is `true`. */
  errors: ErrorObject[] | null;
  /** The input, narrowed to `T`, when `valid` is `true`; `undefined` otherwise. */
  data?: T;
}

// One Ajv instance, one compiled validator per document type, both built
// lazily on first use and cached — most consumers only ever validate one
// or two document types, so there's no reason to compile all eight upfront.
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const compiled = new Map<DocumentType, ValidateFunction>();

function getValidator(docType: DocumentType): ValidateFunction {
  let fn = compiled.get(docType);
  if (fn) return fn;

  const entry = schemas[docType];
  const schema =
    "definition" in entry
      ? { definitions: entry.schema.definitions, $ref: `#/definitions/${entry.definition}` }
      : entry.schema;
  fn = ajv.compile(schema);
  compiled.set(docType, fn);
  return fn;
}

/**
 * Validate `data` against one OES document type's JSON Schema. Does not
 * check cross-file references (a `path` that resolves, `id` uniqueness
 * across a tree, etc.) — that's {@link resolve}'s job, and the tooling
 * roadmap's planned `oes lint`. This only confirms `data`'s own shape.
 */
export function validate<T = unknown>(docType: DocumentType, data: unknown): ValidationResult<T> {
  const fn = getValidator(docType);
  const valid = fn(data) as boolean;
  return valid
    ? { valid: true, errors: null, data: data as T }
    : { valid: false, errors: fn.errors ?? null };
}

export const validateOafArticle = (data: unknown): ValidationResult<OafArticle> =>
  validate<OafArticle>("oaf.article", data);

export const validateOvfVideo = (data: unknown): ValidationResult<OvfVideo> =>
  validate<OvfVideo>("ovf.video", data);

export const validateOrfResource = (data: unknown): ValidationResult<OrfResource> =>
  validate<OrfResource>("orf.resource", data);

export const validateOqfQuestion = (data: unknown): ValidationResult<OqfQuestion> =>
  validate<OqfQuestion>("oqf.question", data);

export const validateOqfStimulus = (data: unknown): ValidationResult<OqfStimulus> =>
  validate<OqfStimulus>("oqf.stimulus", data);

export const validateOpfSet = (data: unknown): ValidationResult<OpfSet> =>
  validate<OpfSet>("opf.set", data);

export const validateOcfCourse = (data: unknown): ValidationResult<OcfCourse> =>
  validate<OcfCourse>("ocf.course", data);

export const validateOcfModule = (data: unknown): ValidationResult<OcfModule> =>
  validate<OcfModule>("ocf.module", data);

export const validateOcfLesson = (data: unknown): ValidationResult<OcfLesson> =>
  validate<OcfLesson>("ocf.lesson", data);

export type { DocumentType } from "./schemas.js";
