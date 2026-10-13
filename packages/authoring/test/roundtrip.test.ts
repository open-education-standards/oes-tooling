import { describe, expect, it } from "vitest";
import type { OqfQuestion } from "@inklyre/oes-core";
import { compileQuestion, decompileQuestion, RoundTripError } from "../src/index.js";

function question(overrides: Record<string, unknown> = {}): OqfQuestion {
  return {
    $schema: "https://open-education-standards.github.io/oes/schemas/oqf/v0.2.0/question.schema.json",
    oqf_version: "0.2.0",
    id: "q",
    type: "mcq",
    title: "A question",
    statement: "What is the answer?",
    type_config: {
      options: [
        { id: "a", content: "First" },
        { id: "b", content: "Second" },
      ],
      answer: "a",
    },
    ...overrides,
  } as unknown as OqfQuestion;
}

/** Decompile then compile, returning what a caller would get back. */
function cycle(input: OqfQuestion): OqfQuestion {
  const authored = decompileQuestion(input, { selfCheck: false });
  return compileQuestion(authored, {
    id: input.id,
    oqfVersion: input.oqf_version,
    validate: false,
  }).question;
}

describe("round trip", () => {
  it("returns the input unchanged for a plain question", () => {
    const input = question();
    expect(cycle(input)).toEqual(input);
  });

  it("survives a statement held in a separate file", () => {
    const input = question({ statement: { file: "statement.md" } });
    const body = "Long prose.\n\nWith two paragraphs.\n";
    const authored = decompileQuestion(input, { statementBody: body });
    const result = compileQuestion(authored, { id: "q" });
    expect(result.question).toEqual(input);
    expect(result.files[1]).toEqual({ path: "statement.md", content: body });
  });

  it("survives rich option content via directive blocks", () => {
    const input = question({
      type_config: {
        options: [
          { id: "a", content: "![Correct](assets/a.png)" },
          { id: "b", content: "![Wrong](assets/b.png)", score: -0.5 },
        ],
        answer: "a",
      },
    });
    const authored = decompileQuestion(input);
    expect(authored).toContain(":::option{id=a}");
    expect(cycle(input)).toEqual(input);
  });

  it("keeps a non-canonical $schema instead of rewriting it", () => {
    const input = question({ $schema: "https://example.test/my/question.schema.json" });
    const authored = decompileQuestion(input);
    expect(authored).toContain("https://example.test/my/question.schema.json");
    expect(cycle(input)).toEqual(input);
  });

  it("keeps oqf_version when it is not the tooling default", () => {
    const input = question({ oqf_version: "0.9.3" });
    expect(decompileQuestion(input, { selfCheck: false })).toContain("oqf_version: 0.9.3");
  });

  it("preserves extension fields the schema does not name", () => {
    const input = question({ x_internal_note: "keep me" });
    expect(cycle(input)).toEqual(input);
  });
});

// Values chosen to break YAML specifically: booleans-by-accident, numeric
// coercion, whitespace the emitter could trim, and the chomping cases that
// decide how many trailing newlines a block scalar keeps.
const HAZARDS: Record<string, string> = {
  norwayNo: "no",
  norwayYes: "yes",
  norwayOn: "on",
  norwayOff: "off",
  hex: "0x1F",
  octal: "0o17",
  version: "1.10",
  leadingZeros: "007",
  sexagesimal: "1:30",
  exponent: "1e5",
  plus: "+1",
  leadingDot: ".5",
  infinity: ".inf",
  notANumber: ".nan",
  bareDash: "-",
  tilde: "~",
  nullish: "null",
  leadingSpace: " leading",
  trailingSpace: "trailing ",
  tab: "has\ttab",
  newlineNone: "a\nb",
  newlineOne: "a\nb\n",
  newlineMany: "a\nb\n\n\n",
  indentedFirstLine: "  indented first\nsecond",
  blankFirstLine: "\nstarts blank",
  colonSpace: "a: b",
  hash: "text # comment",
  anchor: "&anchor",
  alias: "*alias",
  tag: "!tag",
  directive: "%directive",
  backtick: "`tick",
  folded: ">folded",
  literal: "|literal",
  brace: "{a}",
  bracket: "[a]",
  comma: "a,b",
  listItem: "- item",
  endsWithColon: "ends:",
  latex: "$O(\\log n)$",
  latexMatrix: "$$\\begin{bmatrix} a \\\\ b \\end{bmatrix}$$",
  latexUnderscore: "$a_i$ and $a_{i+1}$",
  backslashN: "it's \\n not a newline",
  unicode: "café — naïve ✓ 中文 🎓",
  longUrl: `https://example.test/${"a".repeat(90)}`,
  doubleSpaced: `${"word ".repeat(10)} double  spaced ${"tail ".repeat(10)}`,
  codeFence: "```python\nprint('hi')\n```",
};

describe("hazardous values survive a round trip", () => {
  for (const [name, value] of Object.entries(HAZARDS)) {
    it(`${name}: ${JSON.stringify(value).slice(0, 42)}`, () => {
      const input = question({
        title: value,
        explanation: value,
        hints: [value],
        type_config: {
          options: [
            { id: "a", content: value },
            { id: "b", content: "Second" },
          ],
          answer: "a",
        },
      });
      expect(cycle(input)).toEqual(input);
    });
  }

  it("survives a statement made of every hazard at once", () => {
    const input = question({ statement: Object.values(HAZARDS).join("\n\n") });
    expect(cycle(input)).toEqual(input);
  });
});

describe("self-check", () => {
  it("refuses to return a document that would not compile back", () => {
    // Trailing blank lines in the prose file cannot survive: the body is
    // trimmed on the way in, so the compiler would write back one newline.
    expect(() =>
      decompileQuestion(question({ statement: { file: "statement.md" } }), {
        statementBody: "Prose.\n\n\n",
      }),
    ).toThrow(RoundTripError);
  });

  it("names the field that differs", () => {
    try {
      decompileQuestion(question({ statement: { file: "statement.md" } }), {
        statementBody: "Prose.\n\n\n",
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoundTripError);
      expect((error as RoundTripError).detail[0].path).toBe("statement.file");
    }
  });

  it("requires the prose body for a file-backed statement", () => {
    expect(() => decompileQuestion(question({ statement: { file: "statement.md" } }))).toThrow(
      /pass options.statementBody/,
    );
  });
});
