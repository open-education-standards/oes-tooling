import type { JSX, ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

export interface MarkdownProps {
  /** OES prose: CommonMark plus GFM tables, strikethrough and task lists, with `$…$`/`$$…$$` math. */
  source: string;
  /**
   * Turns a relative link or image URL into one the browser can load, e.g.
   * against the URL of the bundle the prose came from. Absolute URLs are
   * passed through unchanged; unsafe ones (`javascript:` and similar) are
   * removed before this is called.
   */
  resolveUrl?: (url: string) => string;
  /**
   * Renders a fill-in-the-blank marker (`{{id}}`) as an input. When absent,
   * markers are shown as plain text.
   */
  renderBlank?: (id: string) => ReactNode;
  /**
   * Demotes headings by this many levels (capped at h6), so prose headings
   * nest under the headings around it: with 2, `#` renders as `<h3>`.
   */
  headingOffset?: number;
  className?: string;
}

const BLANK = /\{\{([A-Za-z0-9_-]+)\}\}/g;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/** Replace `{{id}}` in text with `<oes-blank data-blank-id="id">` elements. */
function remarkBlanks() {
  return (tree: MdNode) => {
    visit(tree as never, "text", (node: MdNode, index: number | undefined, parent: MdNode | undefined) => {
      if (!parent || index === undefined || !node.value || !BLANK.test(node.value)) return;
      BLANK.lastIndex = 0;
      const parts: MdNode[] = [];
      let last = 0;
      for (const match of node.value.matchAll(BLANK)) {
        if (match.index! > last) parts.push({ type: "text", value: node.value.slice(last, match.index) });
        parts.push({ type: "oesBlank", data: { hName: "oes-blank", hProperties: { dataBlankId: match[1] } } });
        last = match.index! + match[0].length;
      }
      if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
      parent.children!.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}

const isRelative = (url: string) => url !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("/") && !url.startsWith("#");

/**
 * Renders OES Markdown following OES's Markdown Conventions: math is
 * tokenised before inline Markdown (via remark-math), so `_` and `\\`
 * inside math are never mangled. Raw HTML is not rendered. Math needs
 * KaTeX's stylesheet (`katex/dist/katex.min.css`), which this headless
 * component does not include.
 */
export function Markdown({ source, resolveUrl, renderBlank, headingOffset = 0, className = "oes-markdown" }: MarkdownProps) {
  const components: Record<string, unknown> = {};
  if (renderBlank) {
    components["oes-blank"] = (props: { "data-blank-id"?: string }) => <>{renderBlank(props["data-blank-id"] ?? "")}</>;
  }
  if (headingOffset > 0) {
    for (let level = 1; level <= 6; level++) {
      const Tag = `h${Math.min(6, level + headingOffset)}` as "h1";
      components[`h${level}`] = ({ node: _node, ...props }: { node?: unknown } & JSX.IntrinsicElements["h1"]) => <Tag {...props} />;
    }
  }
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, ...(renderBlank ? [remarkBlanks] : [])]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => {
          const safe = defaultUrlTransform(url);
          return safe && resolveUrl && isRelative(safe) ? resolveUrl(safe) : safe;
        }}
        components={components as Components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
