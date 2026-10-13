import type { OcfLesson, OcfModule, ResolvedCourse, ResolvedLessonItem } from "@inklyre/oes-core";

export interface CourseOutlineProps {
  course: ResolvedCourse;
  /**
   * The `id` of the lesson item currently open, if any. The matching
   * item's `<li>` gets `data-active="true"` and its button gets
   * `aria-current="true"` — style off either hook.
   */
  activeItemId?: string;
  /** Called when a lesson item is clicked. Without this, items render as inert buttons. */
  onSelectItem?: (item: ResolvedLessonItem, context: { module: OcfModule; lesson: OcfLesson }) => void;
}

function itemTitle(item: ResolvedLessonItem): string {
  if (item.ref.title) return item.ref.title;
  switch (item.type) {
    case "article":
      return item.article.title;
    case "video":
      return item.video.title;
    case "practice_set":
      return item.set.title;
    case "resource":
      return item.resource.title;
  }
}

/**
 * Renders a resolved course as a nested outline: modules, their lessons,
 * and each lesson's items — the actual sequence a learner goes through.
 * Semantic markup only (`nav`/`h2`/`h3`/`ol`/`li`/`button`), styled
 * entirely via the `oes-course-outline__*` className hooks below.
 */
export function CourseOutline({ course, activeItemId, onSelectItem }: CourseOutlineProps) {
  return (
    <nav className="oes-course-outline" aria-label={course.course.title}>
      <h2 className="oes-course-outline__title">{course.course.title}</h2>
      <ol className="oes-course-outline__modules">
        {course.modules.map((resolvedModule) => (
          <li key={resolvedModule.module.id} className="oes-course-outline__module">
            <h3 className="oes-course-outline__module-title">{resolvedModule.module.title}</h3>
            <ol className="oes-course-outline__lessons">
              {resolvedModule.lessons.map((resolvedLesson) => (
                <li key={resolvedLesson.lesson.id} className="oes-course-outline__lesson">
                  <span className="oes-course-outline__lesson-title">{resolvedLesson.lesson.title}</span>
                  <ol className="oes-course-outline__items">
                    {resolvedLesson.items.map((item) => {
                      const active = item.ref.id === activeItemId;
                      return (
                        <li
                          key={item.ref.id}
                          className={`oes-course-outline__item oes-course-outline__item--${item.type}`}
                          data-active={active ? "true" : undefined}
                        >
                          <button
                            type="button"
                            className="oes-course-outline__item-button"
                            aria-current={active ? "true" : undefined}
                            onClick={() =>
                              onSelectItem?.(item, {
                                module: resolvedModule.module,
                                lesson: resolvedLesson.lesson,
                              })
                            }
                          >
                            {itemTitle(item)}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
