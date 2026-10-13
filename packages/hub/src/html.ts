/**
 * The hub's browse pages: plain server-rendered HTML with every value
 * escaped (a public hub displays other people's content), a stylesheet,
 * and a small script that filters the package list. The pages work without
 * JavaScript; search is an enhancement.
 */
import type { OpkBundle, OpkHubPackage, OpkHubPackageSummary, OpkPackage } from "@inklyre/oes-core";
import type { HubConfig } from "./hub-files.js";

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ENTRY_LABEL: Record<string, string> = {
  course: "Course",
  set: "Practice set",
  article: "Article",
  video: "Video lesson",
  resource: "Resource",
};

function layout(config: HubConfig, title: string, root: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${root}style.css">
</head>
<body>
<header class="top"><a class="brand" href="${root}">${escapeHtml(config.title)}</a></header>
<main>
${body}
</main>
<footer>An <a href="https://open-education-standards.github.io/oes/specs/opk/hubs">OES hub</a>. Machine-readable index: <a href="${root}index.json">index.json</a></footer>
</body>
</html>
`;
}

function tags(list: string[] | undefined): string {
  return list?.length ? `<ul class="tags">${list.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "";
}

export function indexPage(config: HubConfig, packages: OpkHubPackageSummary[]): string {
  const hubUrl = config.url ? `${config.url}index.json` : undefined;
  const rows = packages
    .map((p) => {
      const search = [p.name, p.title, p.description ?? "", ...(p.tags ?? [])].join(" ").toLowerCase();
      return `<li class="pkg" data-search="${escapeHtml(search)}">
  <a href="packages/${escapeHtml(p.name)}/"><span class="title">${escapeHtml(p.title)}</span></a>
  <span class="meta"><code>${escapeHtml(p.name)}</code> · ${escapeHtml(ENTRY_LABEL[p.entry_type ?? ""] ?? "Package")} · v${escapeHtml(p.latest)}</span>
  ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ""}
  ${tags(p.tags)}
</li>`;
    })
    .join("\n");
  const body = `<h1>${escapeHtml(config.title)}</h1>
${config.description ? `<p class="lead">${escapeHtml(config.description)}</p>` : ""}
${hubUrl ? `<p class="connect">To use this hub in an OES app, add <code>${escapeHtml(hubUrl)}</code></p>` : ""}
<label class="search"><span>Search packages</span><input id="search" type="search" placeholder="Search by name, title or tag" autocomplete="off"></label>
<p class="count"><span id="count">${packages.length}</span> package${packages.length === 1 ? "" : "s"}</p>
<ul class="pkgs" id="packages">
${rows || '<li class="empty">No packages published yet.</li>'}
</ul>
<script src="search.js"></script>`;
  return layout(config, config.title, "", body);
}

type Doc = Record<string, unknown>;

/** A readable outline of the latest version's content, from its bundle. */
function outline(bundle: OpkBundle): string {
  const docs = bundle.documents as Record<string, Doc>;
  const title = (key: unknown) => {
    const d = docs[String(key)];
    return escapeHtml(d?.title ?? String(key).split(":")[1] ?? key);
  };
  const entry = docs[`${bundle.entry.type === "set" ? "set" : bundle.entry.type}:${bundle.entry.id}`];
  if (!entry) return "";

  const questionLine = (q: Doc): string => {
    if (Array.isArray(q.parts)) {
      return `<li>${escapeHtml(q.label ? `Question ${q.label}` : q.id)} (multi-part)<ul>${(q.parts as Doc[]).map(questionLine).join("")}</ul></li>`;
    }
    if (Array.isArray(q.from)) {
      return `<li>Any ${escapeHtml(q.select)} of:<ul>${(q.from as Doc[]).map(questionLine).join("")}</ul></li>`;
    }
    const d = docs[String(q.ref)];
    return `<li>${title(q.ref)} <span class="type">${escapeHtml(d?.type ?? "")}</span></li>`;
  };
  const setOutline = (set: Doc) => `<ol>${((set.questions as Doc[]) ?? []).map(questionLine).join("")}</ol>`;

  switch (bundle.entry.type) {
    case "course":
      return `<ol class="outline">${((entry.modules as Doc[]) ?? [])
        .map((m) => {
          const mod = docs[String(m.ref)] ?? {};
          const lessons = ((mod.lessons as Doc[]) ?? [])
            .map((l) => {
              const lesson = docs[String(l.ref)] ?? {};
              const items = ((lesson.items as Doc[]) ?? [])
                .map((i) => `<li><span class="type">${escapeHtml(String(i.type).replace("_", " "))}</span> ${escapeHtml(i.title ?? "") || title(i.ref)}</li>`)
                .join("");
              return `<li>${title(l.ref)}<ul>${items}</ul></li>`;
            })
            .join("");
          return `<li><strong>${title(m.ref)}</strong><ol>${lessons}</ol></li>`;
        })
        .join("")}</ol>`;
    case "set":
      return setOutline(entry);
    case "article": {
      const content = typeof entry.content === "string" ? entry.content : "";
      return `<pre class="excerpt">${escapeHtml(content.slice(0, 600))}${content.length > 600 ? "…" : ""}</pre>`;
    }
    case "video":
      return `<ol>${((entry.chapters as Doc[]) ?? []).map((c) => `<li>${escapeHtml(c.label)}</li>`).join("")}</ol>`;
    case "resource":
      return `<ol>${((entry.toc as Doc[]) ?? []).map((c) => `<li>${escapeHtml(c.label)} <span class="type">p. ${escapeHtml(c.page)}</span></li>`).join("")}</ol>`;
  }
  return "";
}

export function packagePage(
  config: HubConfig,
  doc: OpkHubPackage,
  manifest: OpkPackage,
  bundle: OpkBundle | undefined,
  latest: string | undefined,
): string {
  const root = "../../../";
  const base = config.url ? `${config.url}packages/${doc.name}` : undefined;
  const versions = doc.versions
    .map(
      (v) => `<tr${v.yanked ? ' class="yanked"' : ""}>
  <td><code>${escapeHtml(v.version)}</code>${v.version === latest ? ' <span class="badge">latest</span>' : ""}${v.yanked ? ' <span class="badge warn">yanked</span>' : ""}</td>
  <td>${escapeHtml(v.published_at ?? "")}</td>
  <td><a href="${escapeHtml(v.version)}/bundle.json">bundle</a> · <a href="${escapeHtml(v.version)}/package.json">manifest</a></td>
  <td>${v.yanked_reason ? escapeHtml(v.yanked_reason) : ""}</td>
</tr>`,
    )
    .join("\n");
  const body = `<p class="crumbs"><a href="${root}">All packages</a></p>
<h1>${escapeHtml(manifest.title)}</h1>
<p class="meta"><code>${escapeHtml(doc.name)}</code> · ${escapeHtml(ENTRY_LABEL[manifest.entry.type] ?? "Package")}${latest ? ` · v${escapeHtml(latest)}` : " · every version yanked"}${manifest.license ? ` · ${escapeHtml(manifest.license)}` : ""}</p>
${manifest.description ? `<p class="lead">${escapeHtml(manifest.description)}</p>` : ""}
${tags(manifest.tags)}
${manifest.authors?.length ? `<p class="authors">By ${manifest.authors.map((a) => escapeHtml(a)).join(", ")}</p>` : ""}
${base ? `<p class="connect">Package document: <code>${escapeHtml(base)}.json</code></p>` : ""}
${bundle ? `<h2>Contents</h2>\n${outline(bundle)}` : ""}
<h2>Versions</h2>
<table class="versions"><thead><tr><th>Version</th><th>Published</th><th>Files</th><th></th></tr></thead>
<tbody>
${versions}
</tbody></table>`;
  return layout(config, `${manifest.title} · ${config.title}`, root, body);
}

export const STYLE_CSS = `:root {
  --bg: #ffffff; --fg: #1d1f23; --muted: #5d6470; --line: #e3e6ea; --accent: #2457c5; --chip: #eef2f8; --warn: #a14a00;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #15171a; --fg: #e6e8eb; --muted: #9aa1ab; --line: #2b2f35; --accent: #7aa2f7; --chip: #23272e; --warn: #f0a050; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
.top { border-bottom: 1px solid var(--line); padding: 14px 16px; }
.brand { font-weight: 600; text-decoration: none; color: var(--fg); }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
footer { max-width: 860px; margin: 0 auto; padding: 16px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); }
h1 { margin: 8px 0; line-height: 1.25; }
.lead { color: var(--muted); font-size: 18px; }
.meta, .crumbs, .count, .authors { color: var(--muted); font-size: 14px; }
code { font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.connect { background: var(--chip); padding: 10px 12px; border-radius: 8px; font-size: 14px; }
.search { display: block; margin: 20px 0 8px; }
.search span { display: block; font-size: 14px; color: var(--muted); margin-bottom: 4px; }
.search input { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); }
.pkgs { list-style: none; padding: 0; margin: 0; }
.pkg { padding: 16px 0; border-bottom: 1px solid var(--line); }
.pkg .title { font-weight: 600; font-size: 18px; }
.pkg .meta { display: block; margin-top: 2px; }
.pkg p { margin: 6px 0; }
.tags { list-style: none; padding: 0; margin: 6px 0; display: flex; flex-wrap: wrap; gap: 6px; }
.tags li { background: var(--chip); border-radius: 999px; padding: 2px 10px; font-size: 13px; }
.type { color: var(--muted); font-size: 13px; text-transform: capitalize; }
.outline li, main ol li, main ul li { margin: 3px 0; }
.excerpt { white-space: pre-wrap; background: var(--chip); padding: 12px; border-radius: 8px; font-size: 14px; }
.versions { width: 100%; border-collapse: collapse; font-size: 14px; display: block; overflow-x: auto; }
.versions th, .versions td { text-align: left; padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
.yanked td { color: var(--muted); }
.badge { background: var(--chip); border-radius: 4px; padding: 1px 6px; font-size: 12px; }
.badge.warn { color: var(--warn); }
.empty { color: var(--muted); padding: 16px 0; }
`;

export const SEARCH_JS = `(function () {
  var input = document.getElementById("search");
  var rows = Array.prototype.slice.call(document.querySelectorAll("#packages .pkg"));
  var count = document.getElementById("count");
  if (!input) return;
  input.addEventListener("input", function () {
    var terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var shown = 0;
    rows.forEach(function (row) {
      var text = row.getAttribute("data-search") || "";
      var match = terms.every(function (t) { return text.indexOf(t) !== -1; });
      row.hidden = !match;
      if (match) shown++;
    });
    count.textContent = String(shown);
  });
})();
`;
