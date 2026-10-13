/**
 * Exactly one of `T`'s keys present with its real value; every other key
 * present and typed `undefined`. Models the JSON Schema `oneOf`-over-
 * `required` constraint used throughout OES for "`path` or `*_url`, never
 * both, never neither" in a way that lets every branch's sibling fields be
 * read safely (as `undefined`) without narrowing gymnastics, while still
 * preventing more than one from being set to a real value in a literal.
 */
export type ExactlyOne<T extends Record<string, unknown>> = {
  [K in keyof T]: { [P in K]: T[P] } & { [P in Exclude<keyof T, K>]?: undefined };
}[keyof T];
