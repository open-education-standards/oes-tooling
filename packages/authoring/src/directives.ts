import { AuthoringError } from "./types.js";

/**
 * The four choice-bearing collections a directive block can target, keyed
 * by the directive name an author writes. `option` covers `mcq`/`msq`;
 * `left`/`right` cover `match`; `item` covers `order`.
 */
export const DIRECTIVE_COLLECTIONS = {
  option: "options",
  left: "left",
  right: "right",
  item: "items",
} as const;

export type DirectiveName = keyof typeof DIRECTIVE_COLLECTIONS;

export interface DirectiveBlock {
  name: DirectiveName;
  id: string;
  /** The block's Markdown, delimiter lines excluded, trailing newline stripped. */
  content: string;
  line: number;
}

export interface ExtractedBody {
  /** The body with every directive block removed — the statement. */
  statement: string;
  blocks: DirectiveBlock[];
}

const OPEN = /^:::(option|left|right|item)\{id=([^}\s]+)\}\s*$/;
const CLOSE = /^:::\s*$/;
const FENCE = /^(\s*)(`{3,}|~{3,})/;

function isDirectiveName(value: string): value is DirectiveName {
  return value in DIRECTIVE_COLLECTIONS;
}

/**
 * Pull `:::option{id=…}` blocks out of a body.
 *
 * Fenced code blocks are respected, so a `:::` that happens to appear
 * inside an example listing is content rather than a delimiter. Without
 * this, a question *about* directive syntax could not be written.
 */
export function extractDirectives(body: string): ExtractedBody {
  const lines = body.split("\n");
  const kept: string[] = [];
  const blocks: DirectiveBlock[] = [];

  let fence: string | undefined;
  let open: { name: DirectiveName; id: string; line: number; content: string[] } | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE.exec(line);

    if (fence !== undefined) {
      // Inside a code fence: only a matching closing fence is structural.
      if (fenceMatch && fenceMatch[2].startsWith(fence)) fence = undefined;
      (open ? open.content : kept).push(line);
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[2];
      (open ? open.content : kept).push(line);
      continue;
    }

    if (open) {
      if (CLOSE.test(line)) {
        blocks.push({
          name: open.name,
          id: open.id,
          content: open.content.join("\n").replace(/\n+$/, ""),
          line: open.line,
        });
        open = undefined;
      } else {
        open.content.push(line);
      }
      continue;
    }

    const openMatch = OPEN.exec(line);
    if (openMatch && isDirectiveName(openMatch[1])) {
      open = { name: openMatch[1], id: openMatch[2], line: i + 1, content: [] };
      continue;
    }

    kept.push(line);
  }

  if (fence !== undefined) {
    throw new AuthoringError("a fenced code block in the body is never closed");
  }
  if (open) {
    throw new AuthoringError(`:::${open.name}{id=${open.id}} is never closed`, open.line);
  }

  const seen = new Set<string>();
  for (const block of blocks) {
    const key = `${block.name}:${block.id}`;
    if (seen.has(key)) {
      throw new AuthoringError(`duplicate :::${block.name} block for id '${block.id}'`, block.line);
    }
    seen.add(key);
  }

  return { statement: blocks.length > 0 ? kept.join("\n").replace(/\n+$/, "") : kept.join("\n"), blocks };
}

/**
 * Render directive blocks back into body text, in the order the entries
 * appear in `type_config` so decompiled output is deterministic.
 */
export function renderDirectives(blocks: Omit<DirectiveBlock, "line">[]): string {
  return blocks.map((block) => `:::${block.name}{id=${block.id}}\n${block.content}\n:::`).join("\n\n");
}
