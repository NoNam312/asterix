// Task apps besides Jira, in the browser: the shape /api/tasks returns, how each app is shown,
// and turning a task into a quest.

export type TaskProvider = "todoist" | "github" | "trello" | "linear" | "asana" | "clickup";

export type ExternalTask = {
  provider: TaskProvider;
  /** The app's own id (used to mark it done). */
  id: string;
  /** A short reference when the app has one ("#12", "ENG-42"). */
  ref: string | null;
  title: string;
  /** "2026-10-09", or null. */
  due: string | null;
  /** Project, board, list or repo it belongs to. */
  where: string | null;
  status: string | null;
  url: string;
};

export const TASK_APPS: Record<
  TaskProvider,
  {
    name: string;
    color: string;
    /** What to paste, and where to get it. */
    fields: { key: "token" | "key"; label: string; secret: boolean }[];
    help: { text: string; url: string };
  }
> = {
  todoist: {
    name: "Todoist",
    color: "#e44332",
    fields: [{ key: "token", label: "API token", secret: true }],
    help: { text: "Todoist → Settings → Integrations → Developer → API token", url: "https://app.todoist.com/app/settings/integrations/developer" },
  },
  github: {
    name: "GitHub",
    color: "#57606a",
    fields: [{ key: "token", label: "Personal access token", secret: true }],
    help: {
      text: "GitHub → Settings → Developer settings → Fine-grained tokens (Issues: read and write)",
      url: "https://github.com/settings/personal-access-tokens",
    },
  },
  trello: {
    name: "Trello",
    color: "#0c66e4",
    fields: [
      { key: "key", label: "API key", secret: false },
      { key: "token", label: "Token", secret: true },
    ],
    help: { text: "Create a Power-Up at trello.com/power-ups/admin, then copy its API key and generate a token", url: "https://trello.com/power-ups/admin" },
  },
  linear: {
    name: "Linear",
    color: "#5e6ad2",
    fields: [{ key: "token", label: "Personal API key", secret: true }],
    help: { text: "Linear → Settings → Account → Security & access → Personal API keys", url: "https://linear.app/settings/account/security" },
  },
  asana: {
    name: "Asana",
    color: "#f06a6a",
    fields: [{ key: "token", label: "Personal access token", secret: true }],
    help: { text: "Asana developer console → Personal access tokens", url: "https://app.asana.com/0/my-apps" },
  },
  clickup: {
    name: "ClickUp",
    color: "#7b68ee",
    fields: [{ key: "token", label: "Personal API token", secret: true }],
    help: { text: "ClickUp → Settings → Apps → API token", url: "https://app.clickup.com/settings/apps" },
  },
};

export const TASK_PROVIDERS = Object.keys(TASK_APPS) as TaskProvider[];

/** Drag-and-drop type for a task dragged onto the calendar. */
export const TASK_DRAG_TYPE = "application/x-questlog-task";

/** The notes marker linking a quest to its task ("task:todoist:123"). */
export const taskRef = (t: Pick<ExternalTask, "provider" | "id">) => `task:${t.provider}:${t.id}`;

export function taskRefOf(notes: string | null | undefined): { provider: TaskProvider; id: string } | null {
  const m = notes?.match(/\btask:(todoist|github|trello|linear|asana|clickup):(\S+)/);
  return m ? { provider: m[1] as TaskProvider, id: m[2] } : null;
}

/** What a quest made from a task contains. */
export function questFromTask(t: ExternalTask) {
  const app = TASK_APPS[t.provider].name;
  const due = t.due
    ? ` · due ${new Date(`${t.due}T12:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`
    : "";
  return {
    title: (t.ref ? `${t.ref}: ${t.title}` : t.title).slice(0, 200),
    notes: `${app} task${t.where ? ` in ${t.where}` : ""}${due}\n${t.url}\n${taskRef(t)}`,
    duration: 60,
  };
}

/**
 * An app task quest's notes split into the lines QuestLog added (app line, link, "task:…") and
 * the user's own notes.
 */
export function splitTaskNotes(notes: string) {
  const ref = taskRefOf(notes);
  if (!ref) return { task: null, body: notes };
  const lines = notes.split("\n");
  const markerAt = lines.findIndex((l) => l.startsWith("task:"));
  const appLine = lines.findIndex((l) => new RegExp(`^${TASK_APPS[ref.provider].name} task`).test(l));
  const urlLine = markerAt > 0 && /^https?:\/\//.test(lines[markerAt - 1]) ? markerAt - 1 : -1;
  const ours = new Set([markerAt, appLine, urlLine].filter((i) => i >= 0));
  return {
    task: {
      ...ref,
      lines: lines.filter((_, i) => ours.has(i)),
      summary: appLine >= 0 ? lines[appLine].replace(/ · due .*/, "") : `${TASK_APPS[ref.provider].name} task`,
      url: urlLine >= 0 ? lines[urlLine] : null,
    },
    body: lines.filter((_, i) => !ours.has(i)).join("\n").trim(),
  };
}
