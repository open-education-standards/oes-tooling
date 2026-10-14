import type { OafArticle } from "@inklyre/oes-core";
import { Markdown } from "./Markdown.js";

export interface ArticleViewProps {
  /** A resolved article: `content` must already be a string, as `resolve()` and bundles guarantee. */
  article: OafArticle;
  /** Resolves relative image and link URLs in the article's prose. */
  resolveUrl?: (url: string) => string;
}

/** Renders one OAF article: its title and its Markdown body. Headless. */
export function ArticleView({ article, resolveUrl }: ArticleViewProps) {
  const raw = typeof article.content === "string" ? article.content : "";
  // Markdown often restates its title as a leading "# Title"; the title is already shown.
  const leading = raw.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
  const content = leading && leading[1]!.trim() === article.title.trim() ? raw.slice(leading[0].length) : raw;
  return (
    <article className="oes-article">
      <h2 className="oes-article__title">{article.title}</h2>
      {article.description && <p className="oes-article__description">{article.description}</p>}
      <Markdown source={content} resolveUrl={resolveUrl} headingOffset={2} className="oes-article__body" />
    </article>
  );
}
