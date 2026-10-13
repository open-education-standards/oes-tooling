import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCourse } from "@inklyre/oes-core";
import { CourseOutline } from "../src/CourseOutline.js";

afterEach(cleanup);

const course: ResolvedCourse = {
  course: {
    ocf_version: "0.3.0",
    id: "intro-to-python",
    title: "Introduction to Python",
    modules: [{ id: "getting-started", path: "modules/getting-started" }],
  },
  modules: [
    {
      module: {
        ocf_version: "0.3.0",
        id: "getting-started",
        title: "Getting Started",
        lessons: [{ id: "setup", path: "lessons/setup" }],
      },
      lessons: [
        {
          lesson: {
            ocf_version: "0.3.0",
            id: "setup",
            title: "Setting Up",
            items: [
              { type: "video", id: "install", path: "videos/install" },
              { type: "practice_set", id: "quiz", path: "practice-sets/quiz" },
            ],
          },
          items: [
            {
              type: "video",
              ref: { id: "install", path: "videos/install" },
              video: { ovf_version: "0.1.0", id: "install", title: "Install Python", video_url: "https://example.com/install.mp4" },
            },
            {
              type: "practice_set",
              ref: { id: "quiz", title: "Quick check", path: "practice-sets/quiz" },
              set: { opf_version: "0.2.0", id: "quiz", title: "Quiz", questions: [] },
              questions: [],
            },
          ],
        },
      ],
    },
  ],
};

describe("CourseOutline", () => {
  it("renders the course/module/lesson/item hierarchy", () => {
    render(<CourseOutline course={course} />);
    expect(screen.getByText("Introduction to Python")).toBeTruthy();
    expect(screen.getByText("Getting Started")).toBeTruthy();
    expect(screen.getByText("Setting Up")).toBeTruthy();
    // Falls back to the underlying document's own title when ref.title is absent.
    expect(screen.getByText("Install Python")).toBeTruthy();
    // Uses ref.title when present, over the underlying set's own title.
    expect(screen.getByText("Quick check")).toBeTruthy();
    expect(screen.queryByText("Quiz")).toBeNull();
  });

  it("marks the active item and fires onSelectItem with module/lesson context", () => {
    const onSelectItem = vi.fn();
    const { container } = render(<CourseOutline course={course} activeItemId="quiz" onSelectItem={onSelectItem} />);

    const activeLi = container.querySelector('[data-active="true"]');
    expect(activeLi?.textContent).toBe("Quick check");

    fireEvent.click(screen.getByText("Install Python"));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const [item, context] = onSelectItem.mock.calls[0];
    expect(item.ref.id).toBe("install");
    expect(context.module.id).toBe("getting-started");
    expect(context.lesson.id).toBe("setup");
  });
});
