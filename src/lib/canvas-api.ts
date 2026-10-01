// Server-only: reads your Canvas courses, marks and assignment weightings with your access token.
import "server-only";
import type { CanvasAssignment, CanvasCourse } from "./canvas-grades";

export class CanvasError extends Error {}

/**
 * "canvas.lms.unimelb.edu.au", "https://canvas.lms.unimelb.edu.au/courses/123" → the https origin.
 * Only Canvas sites (an instructure.com address, or a host with "canvas" in it) are allowed, so
 * the server can't be pointed anywhere else.
 */
export function normaliseCanvasUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^http:\/\//i, "https://").replace(/^(?!https:\/\/)/i, "https://"));
  } catch {
    throw new CanvasError("That doesn't look like a Canvas address.");
  }
  const host = url.hostname.toLowerCase();
  const ip = /^[\d.]+$/.test(host) || host.includes(":") || /\.(local|internal|localhost|lan|home)$/.test(host);
  if (url.protocol !== "https:" || ip || !host.includes(".") || !(host.endsWith(".instructure.com") || host.includes("canvas"))) {
    throw new CanvasError("Use your university's Canvas address, like canvas.lms.unimelb.edu.au.");
  }
  return `https://${host}`;
}

async function get(base: string, token: string, path: string) {
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new CanvasError("Couldn't reach Canvas.");
  }
  if (res.status === 401) throw new CanvasError("Canvas didn't accept that access token.");
  if (!res.ok) throw new CanvasError(`Canvas returned an error (${res.status}).`);
  return res.json();
}

export async function verify(base: string, token: string) {
  const me = (await get(base, token, "/users/self")) as { name?: string; short_name?: string };
  return me.short_name || me.name || "Canvas";
}

type RawCourse = {
  id: number;
  name: string;
  course_code?: string;
  apply_assignment_group_weights?: boolean;
  enrollments?: { type: string; computed_current_score?: number | null; computed_current_grade?: string | null }[];
};
type RawAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  assignment_group_id: number;
  submission?: { score?: number | null; grade?: string | null; workflow_state?: string; posted_at?: string | null };
};
type RawGroup = { id: number; group_weight: number | null };

/** "COMP30026_2026_SM2" or "Models of Computation (COMP30026_2026_SM2)" → "COMP30026". */
const codeOf = (c: RawCourse) => (c.course_code ?? c.name).match(/[A-Z]{4}\d{5}/)?.[0] ?? c.course_code ?? c.name;

/** Your active courses, with your current total and every assignment's mark and weighting. */
export async function loadCourses(base: string, token: string): Promise<CanvasCourse[]> {
  const raw = (await get(
    base,
    token,
    "/courses?enrollment_state=active&enrollment_type=student&include[]=total_scores&per_page=50",
  )) as RawCourse[];
  const courses = raw.filter((c) => c.name).slice(0, 12);
  return Promise.all(
    courses.map(async (c) => {
      const enrollment = c.enrollments?.find((e) => e.type === "student");
      const [assignments, groups] = await Promise.all([
        get(base, token, `/courses/${c.id}/assignments?include[]=submission&per_page=100&order_by=due_at`).catch(() => []) as Promise<RawAssignment[]>,
        get(base, token, `/courses/${c.id}/assignment_groups?per_page=50`).catch(() => []) as Promise<RawGroup[]>,
      ]);
      // An assignment's share of the final mark: its group's weight split by points.
      const groupWeight = new Map(groups.map((g) => [g.id, g.group_weight ?? 0]));
      const groupPoints = new Map<number, number>();
      for (const a of assignments) {
        groupPoints.set(a.assignment_group_id, (groupPoints.get(a.assignment_group_id) ?? 0) + (a.points_possible ?? 0));
      }
      const weighted = !!c.apply_assignment_group_weights;
      return {
        id: String(c.id),
        code: codeOf(c),
        name: c.name,
        currentScore: enrollment?.computed_current_score ?? null,
        currentGrade: enrollment?.computed_current_grade ?? null,
        assignments: assignments.map((a): CanvasAssignment => {
          const gw = groupWeight.get(a.assignment_group_id) ?? 0;
          const gp = groupPoints.get(a.assignment_group_id) ?? 0;
          const marked = a.submission?.workflow_state === "graded" && a.submission.score !== null && a.submission.score !== undefined;
          return {
            id: String(a.id),
            name: a.name,
            due: a.due_at,
            points: a.points_possible,
            score: marked ? (a.submission!.score as number) : null,
            grade: marked ? (a.submission!.grade ?? null) : null,
            weight: weighted && gw && gp && a.points_possible ? Math.round(((gw * a.points_possible) / gp) * 10) / 10 : null,
            url: a.html_url,
          };
        }),
      };
    }),
  );
}
