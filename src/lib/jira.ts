// Server-only: talks to Jira Cloud's REST API with the user's API token, which is stored
// encrypted (AES-256-GCM with INTEGRATION_SECRET) so only this server can read it.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { JiraIssue, JiraTransition } from "./jira-issues";

export class JiraError extends Error {}

export type JiraConnection = { site: string; email: string; token_cipher: string; jql: string };

export type { JiraIssue, JiraTransition };

function key() {
  const secret = process.env.INTEGRATION_SECRET;
  const buf = secret ? Buffer.from(secret, "base64") : null;
  if (!buf || buf.length !== 32) throw new JiraError("Jira isn't set up on this server yet (INTEGRATION_SECRET).");
  return buf;
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decryptToken(stored: string) {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * "team.atlassian.net", "https://team.atlassian.net/jira/software/…" → "https://team.atlassian.net".
 * Only Atlassian Cloud sites are allowed, so the server never calls anywhere else.
 */
export function normaliseSite(input: string) {
  const raw = input.trim().replace(/^http:\/\//i, "https://").replace(/^(?!https:\/\/)/i, "https://");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JiraError("That doesn't look like a Jira address.");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.atlassian\.net$/.test(host)) {
    throw new JiraError("Use your Jira Cloud address, like yourteam.atlassian.net.");
  }
  return `https://${host}`;
}

async function jiraFetch(site: string, email: string, token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${site}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new JiraError("Couldn't reach Jira. Check the address and try again.");
  }
  if (res.status === 404 && path.endsWith("/myself")) {
    throw new JiraError("Couldn't find that Jira site. Check the address.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new JiraError("Jira didn't accept that email and API token.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorMessages?: string[] } | null;
    throw new JiraError(body?.errorMessages?.[0] ?? `Jira returned an error (${res.status}).`);
  }
  return res.json();
}

/** Checks the credentials and returns the account's display name. */
export async function verify(site: string, email: string, token: string) {
  const me = (await jiraFetch(site, email, token, "/rest/api/3/myself")) as { displayName?: string };
  return me.displayName ?? email;
}

type RawIssue = {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    duedate?: string | null;
    priority?: { name?: string } | null;
    issuetype?: { name?: string } | null;
    project?: { key?: string; name?: string } | null;
    timeestimate?: number | null;
    timeoriginalestimate?: number | null;
  };
  transitions?: RawTransition[];
};

type RawTransition = { id: string; name: string; to?: { name?: string; statusCategory?: { key?: string } } };

const toTransition = (t: RawTransition): JiraTransition => ({
  id: t.id,
  name: t.name,
  to: t.to?.name ?? t.name,
  toCategory: t.to?.statusCategory?.key ?? "indeterminate",
});

/** Issues matching the connection's JQL (by default: assigned to you and not done). */
export async function searchIssues(conn: JiraConnection, max = 50): Promise<JiraIssue[]> {
  const token = decryptToken(conn.token_cipher);
  const body = (await jiraFetch(conn.site, conn.email, token, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql: conn.jql,
      maxResults: max,
      fields: ["summary", "status", "duedate", "priority", "issuetype", "project", "timeestimate", "timeoriginalestimate"],
      // Each issue's possible status changes, so the status menu doesn't have to ask Jira again.
      expand: "transitions",
    }),
  })) as { issues?: RawIssue[] };
  return (body.issues ?? []).map(({ key, fields: f, transitions }) => {
    const seconds = f.timeestimate ?? f.timeoriginalestimate ?? null;
    return {
      key,
      summary: f.summary ?? key,
      status: f.status?.name ?? "",
      statusCategory: f.status?.statusCategory?.key ?? "new",
      due: f.duedate ?? null,
      priority: f.priority?.name ?? null,
      type: f.issuetype?.name ?? null,
      project: f.project?.name ?? f.project?.key ?? null,
      estimateMin: seconds ? Math.round(seconds / 60) : null,
      url: `${conn.site}/browse/${encodeURIComponent(key)}`,
      transitions: transitions?.map(toTransition),
    };
  });
}


const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

function checkKey(key: string) {
  if (!ISSUE_KEY.test(key)) throw new JiraError("That isn't a Jira issue key.");
  return encodeURIComponent(key);
}

/** The status changes Jira allows for this issue right now (its workflow decides). */
export async function getTransitions(conn: JiraConnection, key: string): Promise<JiraTransition[]> {
  const token = decryptToken(conn.token_cipher);
  const body = (await jiraFetch(conn.site, conn.email, token, `/rest/api/3/issue/${checkKey(key)}/transitions`)) as {
    transitions?: RawTransition[];
  };
  return (body.transitions ?? []).map(toTransition);
}

/**
 * Moves an issue: by transition id, or to the first status in a category ("done" = whatever
 * this project calls finished). Returns the new status.
 */
export async function transitionIssue(
  conn: JiraConnection,
  key: string,
  target: { id: string } | { category: string },
): Promise<{ id: string }> {
  // With an id there's nothing to look up (Jira itself rejects a change the workflow doesn't allow).
  const chosen =
    "id" in target ? { id: target.id } : (await getTransitions(conn, key)).find((t) => t.toCategory === target.category);
  if (!chosen) throw new JiraError("Jira doesn't allow that status change for this issue.");
  const token = decryptToken(conn.token_cipher);
  const res = await fetch(`${conn.site}/rest/api/3/issue/${checkKey(key)}/transitions`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${conn.email}:${token}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transition: { id: chosen.id } }),
  }).catch(() => null);
  // Success is "204 No Content", so this can't go through jiraFetch (which expects JSON).
  if (!res) throw new JiraError("Couldn't reach Jira.");
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { errorMessages?: string[]; errors?: Record<string, string> } | null;
    throw new JiraError(
      err?.errorMessages?.[0] ?? Object.values(err?.errors ?? {})[0] ?? `Jira refused the change (${res.status}).`,
    );
  }
  return chosen;
}
