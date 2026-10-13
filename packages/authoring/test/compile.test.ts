import { describe, expect, it } from "vitest";
import { AuthoringError, compileQuestion } from "../src/index.js";

const MCQ = `---
type: mcq
title: Binary search — time complexity
difficulty: easy
topics: [algorithms, complexity]
type_config:
  options:
    - { id: a, content: $O(1)$ }
    - { id: b, content: $O(\\log n)$ }
  answer: b
---

What is the worst-case time complexity of binary search on \`n\` elements?
`;

describe("compileQuestion", () => {
  it("supplies the fields an author never types", () => {
    const { question } = compileQuestion(MCQ, { id: "binary-search" });
    expect(question.id).toBe("binary-search");
    expect(question.oqf_version).toBe("0.2.0");
    expect((question as { $schema?: string }).$schema).toBe(
      "https://open-education-standards.github.io/oes/schemas/oqf/v0.2.0/question.schema.json",
    );
  });

  it("makes the body the inline statement", () => {
    const { question, files } = compileQuestion(MCQ, { id: "q" });
    expect(question.statement).toBe(
      "What is the worst-case time complexity of binary search on `n` elements?",
    );
    expect(files.map((file) => file.path)).toEqual(["question.json"]);
  });

  it("preserves LaTeX backslashes through the body verbatim", () => {
    const { question } = compileQuestion(MCQ, { id: "q" });
    const options = (question.type_config as { options: { content: string }[] }).options;
    expect(options[1].content).toBe("$O(\\log n)$");
  });

  it("emits a prose file when frontmatter declares statement.file", () => {
    const source = MCQ.replace("type_config:", "statement: { file: statement.md }\ntype_config:");
    const { question, files } = compileQuestion(source, { id: "q" });
    expect(question.statement).toEqual({ file: "statement.md" });
    expect(files.map((file) => file.path)).toEqual(["question.json", "statement.md"]);
    expect(files[1].content).toBe(
      "What is the worst-case time complexity of binary search on `n` elements?\n",
    );
  });

  it("orders output keys canonically regardless of authored order", () => {
    const { question } = compileQuestion(MCQ, { id: "q" });
    expect(Object.keys(question).slice(0, 6)).toEqual([
      "$schema",
      "oqf_version",
      "id",
      "type",
      "title",
      "difficulty",
    ]);
  });

  it("accepts JSON frontmatter, since YAML 1.2 is a superset of JSON", () => {
    const json = `---
{ "type": "mcq", "title": "T",
  "type_config": { "options": [{ "id": "a", "content": "A" }, { "id": "b", "content": "B" }], "answer": "a" } }
---

Body.
`;
    const { question } = compileQuestion(json, { id: "q" });
    expect(question.type).toBe("mcq");
    expect(question.statement).toBe("Body.");
  });

  it("omits $schema when schemaBase is null", () => {
    const { question } = compileQuestion(MCQ, { id: "q", schemaBase: null });
    expect(question).not.toHaveProperty("$schema");
  });
});

describe("directive blocks", () => {
  const withBlocks = `---
type: mcq
title: Correct partition
type_config:
  options:
    - { id: a }
    - { id: b, score: -0.5 }
  answer: a
---

Which diagram is correct?

:::option{id=a}
![Correct](assets/a.png)
:::

:::option{id=b}
![Wrong](assets/b.png)
:::
`;

  it("lifts block content into the matching option", () => {
    const { question } = compileQuestion(withBlocks, { id: "q" });
    const options = (question.type_config as { options: { id: string; content: string }[] }).options;
    expect(options[0].content).toBe("![Correct](assets/a.png)");
    expect(options[1].content).toBe("![Wrong](assets/b.png)");
    expect(question.statement).toBe("Which diagram is correct?");
  });

  it("treats ::: inside a fenced code block as content", () => {
    const source = `---
type: mcq
title: Directive syntax
type_config:
  options:
    - { id: a, content: "yes" }
    - { id: b, content: "no" }
  answer: a
---

What does this author?

\`\`\`markdown
:::option{id=a}
An option
:::
\`\`\`
`;
    const { question } = compileQuestion(source, { id: "q" });
    expect(question.statement).toContain(":::option{id=a}");
    const options = (question.type_config as { options: { content: string }[] }).options;
    expect(options[0].content).toBe("yes");
  });

  it("rejects a block whose id was never declared", () => {
    const source = withBlocks.replace(":::option{id=b}", ":::option{id=zz}");
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/no matching entry in type_config.options/);
  });

  it("rejects content declared in both places", () => {
    const source = withBlocks.replace("- { id: a }", "- { id: a, content: Inline }");
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/use one or the other/);
  });

  it("rejects an unclosed block", () => {
    const source = withBlocks.replace("![Wrong](assets/b.png)\n:::\n", "![Wrong](assets/b.png)\n");
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/never closed/);
  });
});

describe("document structure errors", () => {
  it("requires frontmatter on line 1", () => {
    expect(() => compileQuestion("Just prose.\n", { id: "q" })).toThrow(AuthoringError);
  });

  it("requires the frontmatter to be closed", () => {
    expect(() => compileQuestion("---\ntype: mcq\n", { id: "q" })).toThrow(/never closed/);
  });

  it("rejects duplicate frontmatter keys rather than silently taking the last", () => {
    const source = MCQ.replace("difficulty: easy", "difficulty: easy\ndifficulty: hard");
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/not valid YAML/);
  });

  it("rejects an empty body, since the body is the statement", () => {
    const source = `---
type: mcq
title: T
type_config: { options: [{ id: a, content: A }], answer: a }
---

`;
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/body is empty/);
  });

  it("requires an id from frontmatter or the caller", () => {
    expect(() => compileQuestion(MCQ)).toThrow(/no 'id' in frontmatter/);
  });

  it("reports schema violations rather than emitting an invalid document", () => {
    const source = MCQ.replace("type: mcq", "type: not_a_real_type");
    expect(() => compileQuestion(source, { id: "q" })).toThrow(/does not satisfy the OQF schema/);
  });

  it("does not mistake a horizontal rule in the body for a delimiter", () => {
    const source = MCQ.replace("What is", "Before.\n\n---\n\nWhat is");
    const { question } = compileQuestion(source, { id: "q" });
    expect(question.statement).toContain("---");
  });
});
