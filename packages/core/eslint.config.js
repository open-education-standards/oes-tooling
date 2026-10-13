// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**"],
  },
  {
    rules: {
      // Errors deliberately propagate `cause` (a validation/fetch failure)
      // rather than being narrowed — see ResolveError.cause and validate()'s
      // ErrorObject[]. Enforcing a stricter type there would just push an
      // `as unknown` onto every call site instead of removing anything real.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
