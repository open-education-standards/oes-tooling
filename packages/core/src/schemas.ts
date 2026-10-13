// The actual schema-loading logic lives in @inklyre/oes-schemas (published
// from the spec repo, mirroring schemas/ there exactly) — re-exported here
// so every existing import of "./schemas.js" within this package keeps
// working unchanged.
export { schemas, type DocumentType } from "@inklyre/oes-schemas";
