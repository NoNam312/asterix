// Canvas marks in the browser: the shape /api/canvas returns, and matching a due date (from the
// Canvas calendar feed) to its assignment.

export type CanvasAssignment = {
  id: string;
  name: string;
  /** "2026-10-09T12:59:00Z", or null. */
  due: string | null;
  points: number | null;
  /** Your score, once it's marked. */
  score: number | null;
  /** Canvas's letter/text grade for it, e.g. "H1" or "18", if any. */
  grade: string | null;
  /** Share of the subject's final mark, in %, when the subject weights its assignment groups. */
  weight: number | null;
  url: string;
};

export type CanvasCourse = {
  id: string;
  /** "COMP30026" (or Canvas's course code). */
  code: string;
  name: string;
  /** Current total, in %, if the subject shows it. */
  currentScore: number | null;
  currentGrade: string | null;
  assignments: CanvasAssignment[];
};

/** The Canvas assignment a due date links to ("…#assignment_678535" in its notes). */
export function assignmentIdOf(notes: string | null | undefined) {
  return notes?.match(/#assignment_(\d+)/)?.[1] ?? null;
}

/** All assignments by id, with their course, for quick lookups. */
export function indexAssignments(courses: CanvasCourse[]) {
  const map = new Map<string, CanvasAssignment & { course: CanvasCourse }>();
  for (const c of courses) for (const a of c.assignments) map.set(a.id, { ...a, course: c });
  return map;
}

/** "18 / 20 (90%)" */
export function markLabel(a: Pick<CanvasAssignment, "score" | "points">) {
  if (a.score === null) return null;
  if (!a.points) return `${a.score}`;
  return `${a.score} / ${a.points} (${Math.round((a.score / a.points) * 100)}%)`;
}
