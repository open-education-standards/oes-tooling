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
  const content = typeof article.content === "string" ? article.content : "";
  return (
    <article className="oes-article">
      <h2 className="oes-article__title">{article.title}</h2>
      {article.description && <p className="oes-article__description">{article.description}</p>}
      <Markdown source={content} resolveUrl={resolveUrl} className="oes-article__body" />
    </article>
  );
}
