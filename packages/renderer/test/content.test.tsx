import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkResponse, type OqfQuestion, type QuestionResponse } from "@inklyre/oes-core";
import { ArticleView, Markdown, QuestionView, seededShuffle, VideoPlayer, youtubeId } from "../src/index.js";

afterEach(cleanup);

const q = (type: string, type_config: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ oqf_version: "0.2.0", id: "q1", title: "A question", statement: "Pick one.", type, type_config, ...extra }) as unknown as OqfQuestion;

/** A QuestionView wired to its own state, like an app would. */
function Harness({ question, check = false }: { question: OqfQuestion; check?: boolean }) {
  const [response, setResponse] = useState<QuestionResponse | undefined>();
  const [checked, setChecked] = useState(check);
  return (
    <>
      <QuestionView
        question={question}
        response={response}
        onResponse={setResponse}
        result={checked ? checkResponse(question, response) : undefined}
      />
      <button type="button" onClick={() => setChecked(true)}>
        Check
      </button>
    </>
  );
}

describe("Markdown", () => {
  it("renders math with KaTeX, extracting it before emphasis", () => {
    const { container } = render(<Markdown source="Indices $a_i$ and $a_{i+1}$." />);
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector("em")).toBeNull();
  });

  it("renders GFM tables", () => {
    const { container } = render(<Markdown source={"| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("does not render raw HTML or javascript: links", () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script><img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("resolves relative URLs, and leaves absolute ones alone", () => {
    const { container } = render(
      <Markdown source="![fig](files/a.png) [abs](https://example.org/x)" resolveUrl={(u) => `https://hub.example/pkg/1.0.0/${u}`} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://hub.example/pkg/1.0.0/files/a.png");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.org/x");
  });
});

describe("QuestionView", () => {
  it("mcq: selecting an option, checking, and showing feedback and the explanation", () => {
    const question = q(
      "mcq",
      { options: [{ id: "a", content: "Paris" }, { id: "b", content: "Lyon" }], answer: "a" },
      { explanation: "Paris is the capital." },
    );
    render(<Harness question={question} />);
    fireEvent.click(screen.getByLabelText("Paris"));
    fireEvent.click(screen.getByText("Check"));
    expect(screen.getByRole("status").textContent).toContain("Correct.");
    expect(screen.getByText("Paris is the capital.")).toBeTruthy();
    expect((screen.getByLabelText("Lyon") as HTMLInputElement).disabled).toBe(true);
  });

  it("fill_blank: renders an input where each {{id}} marker is", () => {
    const question = q(
      "fill_blank",
      { blanks: [{ id: "b1", answer: "log n", type: "text" }] },
      { statement: "Binary search runs in O({{b1}}) time." },
    );
    const { container } = render(<Harness question={question} />);
    const input = screen.getByLabelText("Blank b1") as HTMLInputElement;
    expect(container.querySelector(".oes-question__statement p")?.contains(input)).toBe(true);
    fireEvent.change(input, { target: { value: "log n" } });
    fireEvent.click(screen.getByText("Check"));
    expect(screen.getByRole("status").textContent).toContain("Correct.");
  });

  it("order: moving items changes the response", () => {
    const onResponse = vi.fn();
    const question = q("order", {
      items: [{ id: "x", content: "First" }, { id: "y", content: "Second" }],
      correct_order: ["x", "y"],
      shuffle: false,
    });
    render(<QuestionView question={question} onResponse={onResponse} />);
    fireEvent.click(screen.getByLabelText("Move item 1 down"));
    expect(onResponse).toHaveBeenCalledWith({ type: "order", order: ["y", "x"] });
  });

  it("order: the arrangement on screen counts as the answer, even unmoved", () => {
    const question = q("order", {
      items: [{ id: "x", content: "First" }, { id: "y", content: "Second" }],
      correct_order: ["x", "y"],
      shuffle: false,
    });
    render(<Harness question={question} />);
    fireEvent.click(screen.getByText("Check"));
    expect(screen.getByRole("status").textContent).toContain("Correct.");
  });

  it("says a secured question is graded elsewhere", () => {
    const question = q("mcq", { options: [{ id: "a", content: "A" }] }, { answer_key: { withheld: true } });
    render(<Harness question={question} check />);
    expect(screen.getByRole("status").textContent).toContain("graded elsewhere");
  });

  it("shows the rubric for person-graded questions", () => {
    const question = q("essay", { grading: "manual", rubric: { criteria: [{ name: "Defines CAP", points: 5 }] } });
    render(<Harness question={question} check />);
    expect(screen.getByText("Defines CAP")).toBeTruthy();
  });

  it("shuffles deterministically for a given seed", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(seededShuffle(items, "s1")).toEqual(seededShuffle(items, "s1"));
    expect(seededShuffle(items, "s1").slice().sort()).toEqual(items);
  });
});

describe("VideoPlayer with YouTube and relative captions", () => {
  it("embeds a YouTube video instead of a video element", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    const { container } = render(
      <VideoPlayer video={{ ovf_version: "0.1.0", id: "v", title: "V", video_url: "https://youtu.be/dQw4w9WgXcQ" }} />,
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("resolves path captions when given resolveUrl", () => {
    const { container } = render(
      <VideoPlayer
        video={{ ovf_version: "0.1.0", id: "v", title: "V", video_url: "https://example.com/v.mp4", captions: [{ language: "en", path: "files/en.vtt" }] }}
        resolveUrl={(u) => `https://hub.example/x/${u}`}
      />,
    );
    expect(container.querySelector("track")?.getAttribute("src")).toBe("https://hub.example/x/files/en.vtt");
  });
});

describe("ArticleView", () => {
  it("renders the title and the Markdown body", () => {
    const { container } = render(
      <ArticleView article={{ oaf_version: "0.2.0", id: "a", title: "Hello", content: "Some **bold** text." }} />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Hello");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });
});
