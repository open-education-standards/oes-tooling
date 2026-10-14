import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CheckResult, OqfQuestion, OqfStimulus, QuestionResponse } from "@inklyre/oes-core";
import { Markdown } from "./Markdown.js";

export interface QuestionViewProps {
  question: OqfQuestion;
  /** The shared stimulus the question refers to, if any. */
  stimulus?: OqfStimulus;
  /** The learner's response so far. Controlled: keep it in your own state. */
  response?: QuestionResponse;
  onResponse: (response: QuestionResponse) => void;
  /**
   * The result of checking the response (see `checkResponse` in
   * `@inklyre/oes-core`). When set, inputs are locked and feedback and the
   * explanation are shown.
   */
  result?: CheckResult;
  /** Resolves relative image and link URLs in the question's prose. */
  resolveUrl?: (url: string) => string;
  /** Makes shuffled options and items stable for one attempt. */
  shuffleSeed?: string;
}

type Item = { id: string; content: string };

/** A small seeded shuffle, so an attempt keeps its order across re-renders. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const FEEDBACK: Record<string, string> = {
  correct: "Correct.",
  incorrect: "Not quite.",
  unanswered: "No answer given.",
  "graded-elsewhere": "This question is graded elsewhere, so its answer isn't available here.",
  "needs-execution": "Code can't be run here. Compare your solution with the test cases above.",
  "graded-by-a-person": "This question is marked by a person. Compare your answer with the rubric below.",
};

function feedback(result: CheckResult): string {
  if (result.status === "not-checkable") return FEEDBACK[result.reason ?? "graded-elsewhere"]!;
  if (result.status === "partial") return `Partly correct: ${result.score} of ${result.maxScore}.`;
  return FEEDBACK[result.status]!;
}

function Rubric({ rubric }: { rubric: unknown }) {
  if (typeof rubric === "string") return <p className="oes-question__rubric">{rubric}</p>;
  const criteria = (rubric as { criteria?: Array<{ name: string; description?: string; points?: number }> })?.criteria;
  if (!criteria?.length) return null;
  return (
    <ul className="oes-question__rubric">
      {criteria.map((c) => (
        <li key={c.name}>
          <strong>{c.name}</strong>
          {c.points !== undefined && ` (${c.points} points)`}
          {c.description && ` — ${c.description}`}
        </li>
      ))}
    </ul>
  );
}

const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Renders one OQF question of any type: its stimulus, statement, hints, an
 * input for the learner's response, and, once `result` is given, feedback
 * and the explanation. Headless: semantic HTML with `oes-question__*`
 * class hooks and no CSS.
 */
export function QuestionView({ question, stimulus, response, onResponse, result, resolveUrl, shuffleSeed }: QuestionViewProps) {
  const q = question;
  const locked = result !== undefined;
  const seed = shuffleSeed ?? q.id;
  const [hintsShown, setHintsShown] = useState(0);
  const md = (source: string) => <Markdown source={source} resolveUrl={resolveUrl} headingOffset={3} />;
  const statement = typeof q.statement === "string" ? q.statement : "";
  const name = `oes-q-${q.id}`;

  // An order question always has an answer: the arrangement on screen. Report
  // the initial one, so checking without moving anything isn't "unanswered".
  useEffect(() => {
    if (q.type !== "order" || response?.type === "order" || locked) return;
    const initial = q.type_config.shuffle === false ? q.type_config.items : seededShuffle(q.type_config.items, seed);
    onResponse({ type: "order", order: initial.map((i) => i.id) });
  }, [q, seed]);

  const input = useMemo<ReactNode>(() => {
    switch (q.type) {
      case "mcq":
      case "msq": {
        const cfg = q.type_config;
        const options = cfg.shuffle_options ? seededShuffle(cfg.options, seed) : cfg.options;
        const multi = q.type === "msq";
        const selected = new Set(
          response?.type === "mcq" ? (response.selected ? [response.selected] : []) : response?.type === "msq" ? response.selected : [],
        );
        const correct = new Set(q.type === "mcq" ? (q.type_config.answer ? [q.type_config.answer] : []) : (q.type_config.answers ?? []));
        return (
          <fieldset className="oes-question__options">
            <legend className="oes-visually-hidden">{multi ? "Choose all that apply" : "Choose one"}</legend>
            {options.map((o) => {
              const mark = locked && result?.status !== "not-checkable" ? (correct.has(o.id) ? " oes-question__option--correct" : "") : "";
              return (
                <label key={o.id} className={`oes-question__option${selected.has(o.id) ? " oes-question__option--selected" : ""}${mark}`}>
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={name}
                    value={o.id}
                    checked={selected.has(o.id)}
                    disabled={locked}
                    onChange={(e) => {
                      if (!multi) return onResponse({ type: "mcq", selected: o.id });
                      const next = new Set(selected);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      onResponse({ type: "msq", selected: [...next] });
                    }}
                  />
                  {md(o.content)}
                </label>
              );
            })}
          </fieldset>
        );
      }
      case "numerical": {
        const value = response?.type === "numerical" ? response.value : undefined;
        return (
          <label className="oes-question__numeric">
            <span>Your answer</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={value === undefined || Number.isNaN(value) ? "" : value}
              disabled={locked}
              onChange={(e) => onResponse({ type: "numerical", value: e.target.value === "" ? undefined : e.target.valueAsNumber })}
            />
            {q.type_config.unit && <span className="oes-question__unit">{q.type_config.unit}</span>}
          </label>
        );
      }
      case "order": {
        const initial = q.type_config.shuffle === false ? q.type_config.items : seededShuffle(q.type_config.items, seed);
        const order = response?.type === "order" && response.order.length ? response.order : initial.map((i) => i.id);
        const byId = new Map(q.type_config.items.map((i) => [i.id, i]));
        const move = (from: number, to: number) => {
          const next = order.slice();
          [next[from], next[to]] = [next[to]!, next[from]!];
          onResponse({ type: "order", order: next });
        };
        return (
          <ol className="oes-question__order">
            {order.map((id, i) => (
              <li key={id} className="oes-question__order-item">
                {md(byId.get(id)?.content ?? id)}
                <span className="oes-question__order-controls">
                  <button type="button" disabled={locked || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move item ${i + 1} up`}>
                    ↑
                  </button>
                  <button type="button" disabled={locked || i === order.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move item ${i + 1} down`}>
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        );
      }
      case "match": {
        const cfg = q.type_config;
        const right: Item[] = cfg.shuffle === false ? cfg.right : seededShuffle(cfg.right, seed);
        const pairs = response?.type === "match" ? response.pairs : {};
        return (
          <div className="oes-question__match">
            {cfg.left.map((l, i) => (
              <div key={l.id} className={`oes-question__match-row${result?.parts ? (result.parts[l.id] ? " oes-question__part--correct" : " oes-question__part--incorrect") : ""}`}>
                <div className="oes-question__match-left">{md(l.content)}</div>
                <label>
                  <span className="oes-visually-hidden">Match for item {i + 1}</span>
                  <select
                    value={pairs[l.id] ?? ""}
                    disabled={locked}
                    onChange={(e) => onResponse({ type: "match", pairs: { ...pairs, [l.id]: e.target.value } })}
                  >
                    <option value="">Choose…</option>
                    {right.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.content}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        );
      }
      case "diagram": {
        const cfg = q.type_config;
        const image = typeof cfg.image === "string" ? cfg.image : cfg.image.file;
        const labels = response?.type === "diagram" ? response.labels : {};
        return (
          <div className="oes-question__diagram">
            <div className="oes-question__diagram-figure" style={{ position: "relative" }}>
              <img src={resolveUrl ? resolveUrl(image) : image} alt="Diagram to label" style={{ display: "block", maxWidth: "100%" }} />
              {cfg.labels.map((l, i) => (
                <span
                  key={l.id}
                  className="oes-question__diagram-marker"
                  aria-hidden="true"
                  style={{ position: "absolute", left: `${l.position.x}%`, top: `${l.position.y}%`, transform: "translate(-50%, -50%)" }}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <ol className="oes-question__diagram-labels">
              {cfg.labels.map((l, i) => (
                <li key={l.id} className={result?.parts ? (result.parts[l.id] ? "oes-question__part--correct" : "oes-question__part--incorrect") : undefined}>
                  <label>
                    <span>Point {i + 1}</span>
                    <input
                      type="text"
                      value={labels[l.id] ?? ""}
                      disabled={locked}
                      onChange={(e) => onResponse({ type: "diagram", labels: { ...labels, [l.id]: e.target.value } })}
                    />
                  </label>
                  {locked && l.answer !== undefined && result?.parts && !result.parts[l.id] && (
                    <span className="oes-question__expected"> Expected: {l.answer}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      }
      case "code": {
        const cfg = q.type_config;
        const language = response?.type === "code" ? response.language : cfg.languages[0]!;
        const starter = cfg.starter_code?.[language];
        const template = typeof starter === "string" ? starter : (starter?.template ?? "");
        const code = response?.type === "code" && response.language === language ? response.code : template;
        const prefix = typeof starter === "object" ? starter.prefix : undefined;
        const suffix = typeof starter === "object" ? starter.suffix : undefined;
        const visible = cfg.test_cases.filter((t) => !t.is_hidden);
        return (
          <div className="oes-question__code">
            {cfg.languages.length > 1 && (
              <label>
                <span>Language</span>
                <select value={language} disabled={locked} onChange={(e) => onResponse({ type: "code", language: e.target.value, code: "" })}>
                  {cfg.languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {prefix && <pre className="oes-question__code-locked">{prefix}</pre>}
            <label>
              <span className="oes-visually-hidden">Your code</span>
              <textarea
                className="oes-question__code-editor"
                spellCheck={false}
                rows={Math.max(6, code.split("\n").length + 1)}
                value={code}
                disabled={locked}
                onChange={(e) => onResponse({ type: "code", language, code: e.target.value })}
              />
            </label>
            {suffix && <pre className="oes-question__code-locked">{suffix}</pre>}
            {visible.length > 0 && (
              <table className="oes-question__tests">
                <thead>
                  <tr>
                    <th>Input</th>
                    <th>Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <code>{JSON.stringify(t.input)}</code>
                      </td>
                      <td>
                        <code>{JSON.stringify(t.expected)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {cfg.test_cases.length > visible.length && (
              <p className="oes-question__note">{cfg.test_cases.length - visible.length} more test case(s) are hidden.</p>
            )}
          </div>
        );
      }
      case "short_answer":
      case "essay": {
        const text = response?.type === q.type ? response.text : "";
        const min = q.type === "essay" ? q.type_config.min_words : undefined;
        const max = q.type_config.max_words;
        return (
          <label className="oes-question__text">
            <span className="oes-visually-hidden">Your answer</span>
            <textarea rows={q.type === "essay" ? 12 : 5} value={text} disabled={locked} onChange={(e) => onResponse({ type: q.type, text: e.target.value } as QuestionResponse)} />
            <span className="oes-question__word-count">
              {words(text)} words{min !== undefined && `, at least ${min}`}
              {max !== undefined && `, at most ${max}`}
            </span>
          </label>
        );
      }
      case "submission": {
        const value = response?.type === "submission" ? response.value : "";
        const formats = q.type_config.formats;
        return (
          <label className="oes-question__submission">
            <span>
              Your submission ({formats.map((f) => (f === "git_repo" ? "a git repository link" : f === "url" ? "a link" : "a file")).join(" or ")})
            </span>
            <input type="text" value={value} disabled={locked} onChange={(e) => onResponse({ type: "submission", value: e.target.value })} />
          </label>
        );
      }
      default:
        return null;
    }
  }, [q, response, locked, result, seed, resolveUrl, onResponse, name]);

  const fillBlankInputs =
    q.type === "fill_blank"
      ? (id: string) => {
          const blanks = response?.type === "fill_blank" ? response.blanks : {};
          const part = result?.parts?.[id];
          return (
            <input
              type="text"
              aria-label={`Blank ${id}`}
              className={`oes-question__blank${part === undefined ? "" : part ? " oes-question__part--correct" : " oes-question__part--incorrect"}`}
              value={blanks[id] ?? ""}
              disabled={locked}
              onChange={(e) => onResponse({ type: "fill_blank", blanks: { ...blanks, [id]: e.target.value } })}
            />
          );
        }
      : undefined;

  const hints = q.hints ?? [];
  const rubric = "type_config" in q && q.type_config && "rubric" in q.type_config ? (q.type_config as { rubric?: unknown }).rubric : undefined;

  return (
    <article className={`oes-question oes-question--${q.type}`} aria-labelledby={`${name}-title`}>
      <h3 id={`${name}-title`} className="oes-question__title">
        {q.title}
      </h3>
      {stimulus && typeof stimulus.content === "string" && (
        <section className="oes-question__stimulus" aria-label={stimulus.title ?? "Stimulus"}>
          {stimulus.title && <h4>{stimulus.title}</h4>}
          {md(stimulus.content)}
        </section>
      )}
      <div className="oes-question__statement">
        <Markdown source={statement} resolveUrl={resolveUrl} renderBlank={fillBlankInputs} headingOffset={3} />
      </div>
      {input}
      {hints.length > 0 && !locked && (
        <div className="oes-question__hints">
          {hints.slice(0, hintsShown).map((h, i) => (
            <div key={i} className="oes-question__hint">
              {md(h)}
            </div>
          ))}
          {hintsShown < hints.length && (
            <button type="button" onClick={() => setHintsShown(hintsShown + 1)}>
              {hintsShown === 0 ? "Show a hint" : "Show another hint"}
            </button>
          )}
        </div>
      )}
      {result && (
        <div className={`oes-question__feedback oes-question__feedback--${result.status}`} role="status">
          <p>{feedback(result)}</p>
          {rubric !== undefined && result.reason === "graded-by-a-person" && <Rubric rubric={rubric} />}
          {q.explanation && <div className="oes-question__explanation">{md(q.explanation)}</div>}
        </div>
      )}
    </article>
  );
}
