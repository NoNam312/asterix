// Server-only: talks to each task app's API with the user's token (decrypted here, never sent to
// the browser). Every app answers the same three questions: who is this, what's assigned to
// them, and mark this one done.
import "server-only";
import type { ExternalTask, TaskProvider } from "./task-apps";

export class TaskAppError extends Error {}

export type Credentials = { token: string; key?: string };

type Provider = {
  /** Checks the credentials; returns the account's display name. */
  verify: (c: Credentials) => Promise<string>;
  list: (c: Credentials) => Promise<ExternalTask[]>;
  complete: (c: Credentials, id: string) => Promise<void>;
};

async function call(url: string, init: RequestInit & { app: string }) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new TaskAppError(`Couldn't reach ${init.app}.`);
  }
  if (res.status === 401 || res.status === 403) throw new TaskAppError(`${init.app} didn't accept that token.`);
  if (!res.ok) throw new TaskAppError(`${init.app} returned an error (${res.status}).`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

/** "2026-10-09T12:00:00Z" or a timestamp → "2026-10-09" (local date of the due time). */
const dayOf = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// --- Todoist (unified API v1) ------------------------------------------------------------------
const todoist: Provider = {
  async verify({ token }) {
    const me = (await call("https://api.todoist.com/api/v1/user", { app: "Todoist", headers: { Authorization: `Bearer ${token}` } })) as
      | { full_name?: string; email?: string }
      | null;
    return me?.full_name || me?.email || "Todoist";
  },
  async list({ token }) {
    const headers = { Authorization: `Bearer ${token}` };
    const [tasks, projects] = await Promise.all([
      call("https://api.todoist.com/api/v1/tasks?limit=100", { app: "Todoist", headers }),
      call("https://api.todoist.com/api/v1/projects?limit=100", { app: "Todoist", headers }),
    ]);
    const names = new Map(((projects as { results?: { id: string; name: string }[] })?.results ?? []).map((p) => [p.id, p.name]));
    type T = { id: string; content: string; due?: { date?: string } | null; project_id?: string; checked?: boolean };
    return ((tasks as { results?: T[] })?.results ?? [])
      .filter((t) => !t.checked)
      .map((t) => ({
        provider: "todoist" as const,
        id: t.id,
        ref: null,
        title: t.content,
        due: dayOf(t.due?.date?.slice(0, 10)),
        where: (t.project_id && names.get(t.project_id)) || null,
        status: null,
        url: `https://app.todoist.com/app/task/${t.id}`,
      }));
  },
  async complete({ token }, id) {
    await call(`https://api.todoist.com/api/v1/tasks/${encodeURIComponent(id)}/close`, {
      app: "Todoist",
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

// --- GitHub (issues and pull requests assigned to you) ------------------------------------------
const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "QuestLog",
});
const github: Provider = {
  async verify({ token }) {
    const me = (await call("https://api.github.com/user", { app: "GitHub", headers: ghHeaders(token) })) as { login?: string; name?: string } | null;
    return me?.name || me?.login || "GitHub";
  },
  async list({ token }) {
    type I = {
      number: number;
      title: string;
      html_url: string;
      repository?: { full_name?: string };
      milestone?: { due_on?: string | null } | null;
      pull_request?: unknown;
      labels?: { name: string }[];
    };
    const issues = ((await call("https://api.github.com/issues?filter=assigned&state=open&per_page=50", {
      app: "GitHub",
      headers: ghHeaders(token),
    })) ?? []) as I[];
    return issues.map((i) => {
      const repo = i.repository?.full_name ?? "";
      return {
        provider: "github" as const,
        id: `${repo}#${i.number}`,
        ref: `#${i.number}`,
        title: i.title,
        due: dayOf(i.milestone?.due_on),
        where: repo || null,
        status: i.pull_request ? "Pull request" : "Open",
        url: i.html_url,
      };
    });
  },
  async complete({ token }, id) {
    const m = id.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
    if (!m) throw new TaskAppError("That isn't a GitHub issue.");
    await call(`https://api.github.com/repos/${m[1]}/issues/${m[2]}`, {
      app: "GitHub",
      method: "PATCH",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    });
  },
};

// --- Trello (cards you're a member of) ------------------------------------------------------------
const trelloUrl = (path: string, c: Credentials, params = "") =>
  `https://api.trello.com/1${path}?key=${encodeURIComponent(c.key ?? "")}&token=${encodeURIComponent(c.token)}${params}`;
const trello: Provider = {
  async verify(c) {
    if (!c.key) throw new TaskAppError("Trello needs both the API key and the token.");
    const me = (await call(trelloUrl("/members/me", c, "&fields=fullName,username"), { app: "Trello" })) as
      | { fullName?: string; username?: string }
      | null;
    return me?.fullName || me?.username || "Trello";
  },
  async list(c) {
    type Card = { id: string; name: string; due?: string | null; dueComplete?: boolean; url: string; idBoard: string };
    const [cards, boards] = await Promise.all([
      call(trelloUrl("/members/me/cards", c, "&filter=open&fields=name,due,dueComplete,url,idBoard"), { app: "Trello" }),
      call(trelloUrl("/members/me/boards", c, "&filter=open&fields=name"), { app: "Trello" }),
    ]);
    const names = new Map(((boards ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
    return ((cards ?? []) as Card[])
      .filter((card) => !card.dueComplete)
      .map((card) => ({
        provider: "trello" as const,
        id: card.id,
        ref: null,
        title: card.name,
        due: dayOf(card.due),
        where: names.get(card.idBoard) ?? null,
        status: null,
        url: card.url,
      }));
  },
  async complete(c, id) {
    await call(trelloUrl(`/cards/${encodeURIComponent(id)}`, c, "&dueComplete=true"), { app: "Trello", method: "PUT" });
  },
};

// --- Linear (GraphQL) -----------------------------------------------------------------------------
async function linearQuery(token: string, query: string, variables: Record<string, unknown> = {}) {
  const body = (await call("https://api.linear.app/graphql", {
    app: "Linear",
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })) as { data?: Record<string, unknown>; errors?: { message: string }[] } | null;
  if (body?.errors?.length) throw new TaskAppError(`Linear: ${body.errors[0].message}`);
  return body?.data ?? {};
}
const linear: Provider = {
  async verify({ token }) {
    const data = (await linearQuery(token, "query { viewer { name } }")) as { viewer?: { name?: string } };
    return data.viewer?.name || "Linear";
  },
  async list({ token }) {
    const data = (await linearQuery(
      token,
      `query { viewer { assignedIssues(first: 50, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
        nodes { id identifier title dueDate url state { name } team { name } } } } }`,
    )) as {
      viewer?: {
        assignedIssues?: {
          nodes: { id: string; identifier: string; title: string; dueDate?: string | null; url: string; state?: { name: string }; team?: { name: string } }[];
        };
      };
    };
    return (data.viewer?.assignedIssues?.nodes ?? []).map((i) => ({
      provider: "linear" as const,
      id: i.id,
      ref: i.identifier,
      title: i.title,
      due: dayOf(i.dueDate),
      where: i.team?.name ?? null,
      status: i.state?.name ?? null,
      url: i.url,
    }));
  },
  async complete({ token }, id) {
    const data = (await linearQuery(
      token,
      `query($id: String!) { issue(id: $id) { team { states(filter: { type: { eq: "completed" } }) { nodes { id } } } } }`,
      { id },
    )) as { issue?: { team?: { states?: { nodes: { id: string }[] } } } };
    const stateId = data.issue?.team?.states?.nodes[0]?.id;
    if (!stateId) throw new TaskAppError("Linear has no Done state for this issue's team.");
    await linearQuery(token, `mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }`, {
      id,
      stateId,
    });
  },
};

// --- Asana (incomplete tasks assigned to you, in every workspace) ---------------------------------
const asanaHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });
const asana: Provider = {
  async verify({ token }) {
    const me = (await call("https://app.asana.com/api/1.0/users/me?opt_fields=name", { app: "Asana", headers: asanaHeaders(token) })) as
      | { data?: { name?: string } }
      | null;
    return me?.data?.name || "Asana";
  },
  async list({ token }) {
    const me = (await call("https://app.asana.com/api/1.0/users/me?opt_fields=workspaces.gid", { app: "Asana", headers: asanaHeaders(token) })) as {
      data?: { workspaces?: { gid: string }[] };
    } | null;
    type T = { gid: string; name: string; due_on?: string | null; due_at?: string | null; permalink_url: string; projects?: { name: string }[] };
    const lists = await Promise.all(
      (me?.data?.workspaces ?? []).slice(0, 5).map((w) =>
        call(
          `https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${w.gid}&completed_since=now&limit=50&opt_fields=name,due_on,due_at,permalink_url,projects.name`,
          { app: "Asana", headers: asanaHeaders(token) },
        ),
      ),
    );
    return lists.flatMap((l) =>
      ((l as { data?: T[] } | null)?.data ?? []).map((t) => ({
        provider: "asana" as const,
        id: t.gid,
        ref: null,
        title: t.name,
        due: dayOf(t.due_on ?? t.due_at),
        where: t.projects?.[0]?.name ?? null,
        status: null,
        url: t.permalink_url,
      })),
    );
  },
  async complete({ token }, id) {
    await call(`https://app.asana.com/api/1.0/tasks/${encodeURIComponent(id)}`, {
      app: "Asana",
      method: "PUT",
      headers: { ...asanaHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ data: { completed: true } }),
    });
  },
};

// --- ClickUp (tasks assigned to you, in every workspace) --------------------------------------------
const cuHeaders = (token: string) => ({ Authorization: token, "Content-Type": "application/json" });
const clickup: Provider = {
  async verify({ token }) {
    const me = (await call("https://api.clickup.com/api/v2/user", { app: "ClickUp", headers: cuHeaders(token) })) as {
      user?: { username?: string; email?: string };
    } | null;
    return me?.user?.username || me?.user?.email || "ClickUp";
  },
  async list({ token }) {
    const headers = cuHeaders(token);
    const [me, teams] = await Promise.all([
      call("https://api.clickup.com/api/v2/user", { app: "ClickUp", headers }),
      call("https://api.clickup.com/api/v2/team", { app: "ClickUp", headers }),
    ]);
    const uid = (me as { user?: { id?: number } } | null)?.user?.id;
    type T = { id: string; custom_id?: string | null; name: string; due_date?: string | null; url: string; status?: { status: string }; list?: { name: string } };
    const lists = await Promise.all(
      ((teams as { teams?: { id: string }[] } | null)?.teams ?? []).slice(0, 5).map((t) =>
        call(`https://api.clickup.com/api/v2/team/${t.id}/task?assignees[]=${uid}&include_closed=false&subtasks=true`, { app: "ClickUp", headers }),
      ),
    );
    return lists.flatMap((l) =>
      ((l as { tasks?: T[] } | null)?.tasks ?? []).map((t) => ({
        provider: "clickup" as const,
        id: t.id,
        ref: t.custom_id ?? null,
        title: t.name,
        due: dayOf(t.due_date),
        where: t.list?.name ?? null,
        status: t.status?.status ?? null,
        url: t.url,
      })),
    );
  },
  async complete({ token }, id) {
    const headers = cuHeaders(token);
    const task = (await call(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}`, { app: "ClickUp", headers })) as {
      list?: { id: string };
    } | null;
    const list = (await call(`https://api.clickup.com/api/v2/list/${task?.list?.id}`, { app: "ClickUp", headers })) as {
      statuses?: { status: string; type: string }[];
    } | null;
    const done = list?.statuses?.find((s) => s.type === "closed" || s.type === "done");
    if (!done) throw new TaskAppError("ClickUp has no closed status for this list.");
    await call(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}`, {
      app: "ClickUp",
      method: "PUT",
      headers,
      body: JSON.stringify({ status: done.status }),
    });
  },
};

export const PROVIDERS: Record<TaskProvider, Provider> = { todoist, github, trello, linear, asana, clickup };
