/**
 * The current $schema URL for each document type this scaffold writes.
 * Points at the live docs site, matching oes's own editor-setup.md — not
 * the $id namespace inside the schema files, which isn't itself fetchable.
 */
const SCHEMA_BASE = "https://open-education-standards.github.io/oes/schemas";

export interface ScaffoldOptions {
  id: string;
  title: string;
  authors?: string[];
  license?: string;
}

export interface ScaffoldFile {
  /** Forward-slash-separated, relative to the scaffold's output directory. */
  path: string;
  /** Final file content, including a trailing newline. */
  content: string;
}

function json(doc: Record<string, unknown>): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Builds a minimal, valid OES course tree in memory: one course, one
 * module, one lesson, one practice set, one question — every level the
 * OCF hierarchy requires, and nothing more. Pure — no filesystem access,
 * so it's trivially unit-testable and reusable outside the CLI (e.g. a
 * future Studio "new course" flow).
 */
export function buildScaffold(options: ScaffoldOptions): ScaffoldFile[] {
  const { id, title, authors, license } = options;

  const course: Record<string, unknown> = {
    $schema: `${SCHEMA_BASE}/ocf/v0.3.0/course.schema.json`,
    ocf_version: "0.3.0",
    id,
    title,
    ...(authors ? { authors } : {}),
    ...(license ? { license } : {}),
    modules: [{ id: "intro", path: "modules/intro" }],
  };

  const module_: Record<string, unknown> = {
    $schema: `${SCHEMA_BASE}/ocf/v0.3.0/course.schema.json`,
    ocf_version: "0.3.0",
    id: "intro",
    title: "Introduction",
    lessons: [{ id: "welcome", path: "lessons/welcome" }],
  };

  const lesson: Record<string, unknown> = {
    $schema: `${SCHEMA_BASE}/ocf/v0.3.0/course.schema.json`,
    ocf_version: "0.3.0",
    id: "welcome",
    title: "Welcome",
    items: [{ type: "practice_set", id: "quiz", title: "Quick check", path: "practice-sets/quiz" }],
  };

  const set: Record<string, unknown> = {
    $schema: `${SCHEMA_BASE}/opf/v0.3.0/set.schema.json`,
    opf_version: "0.3.0",
    id: "quiz",
    title: "Quick Check",
    questions: [{ id: "example-question", path: "questions/example-question.json", points: 10 }],
  };

  const question: Record<string, unknown> = {
    $schema: `${SCHEMA_BASE}/oqf/v0.2.0/question.schema.json`,
    oqf_version: "0.2.0",
    id: "example-question",
    type: "mcq",
    title: "Example Question",
    statement: "What does OES stand for?",
    type_config: {
      options: [
        { id: "a", content: "Open Education Standards" },
        { id: "b", content: "Open Educational Software" },
        { id: "c", content: "Online Exam System" },
      ],
      answer: "a",
    },
  };

  return [
    { path: "course.json", content: json(course) },
    { path: "modules/intro/module.json", content: json(module_) },
    { path: "modules/intro/lessons/welcome/lesson.json", content: json(lesson) },
    { path: "modules/intro/lessons/welcome/practice-sets/quiz/set.json", content: json(set) },
    {
      path: "modules/intro/lessons/welcome/practice-sets/quiz/questions/example-question.json",
      content: json(question),
    },
  ];
}
