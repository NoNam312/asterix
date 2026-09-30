// Jira issues in the browser: the shape /api/jira returns, and turning one into a quest.

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  /** Jira's status category: "new" (To Do), "indeterminate" (In Progress) or "done". */
  statusCategory: string;
  /** "2026-10-09", or null if it has no due date. */
  due: string | null;
  priority: string | null;
  type: string | null;
  project: string | null;
  /** Remaining (or original) estimate in minutes, if set. */
  estimateMin: number | null;
  url: string;
  /** Statuses it can move to right now, loaded with the issue so the status menu opens instantly. */
  transitions?: JiraTransition[];
};

export type JiraTransition = { id: string; name: string; to: string; toCategory: string };

/** Jira's blue, used to mark quests made from Jira issues. */
export const JIRA_COLOR = "#2684ff";
/** Second colour of the Jira edge on quests (Atlassian purple). */
export const JIRA_COLOR_2 = "#6554c0";

/** Drag-and-drop type for an issue dragged onto the calendar. */
export const JIRA_DRAG_TYPE = "application/x-questlog-jira";

/** The notes marker linking a quest to its issue ("jira:ABC-12"). */
export const jiraRef = (key: string) => `jira:${key}`;

export function jiraKeyOf(notes: string | null | undefined) {
  return notes?.match(/\bjira:([A-Z][A-Z0-9_]+-\d+)\b/)?.[1] ?? null;
}

/** Local date of a Jira due date ("2026-10-09"). */
export const dueDate = (due: string) => {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Quest length from the issue's estimate: 15 min steps, 30 min to 4 h, 1 h if unknown. */
export function questMinutes(issue: Pick<JiraIssue, "estimateMin">) {
  if (!issue.estimateMin) return 60;
  return Math.min(240, Math.max(30, Math.round(issue.estimateMin / 15) * 15));
}

/** What a quest made from an issue contains. */
export function questFromIssue(issue: JiraIssue) {
  const due = issue.due
    ? ` · due ${dueDate(issue.due).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`
    : "";
  return {
    title: `${issue.key}: ${issue.summary}`.slice(0, 200),
    notes: `Jira ${issue.type ?? "issue"} in ${issue.project ?? "Jira"}${due}\n${issue.url}\n${jiraRef(issue.key)}`,
    duration: questMinutes(issue),
  };
}
