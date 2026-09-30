"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

type Status =
  | { state: "loading" }
  | { state: "disconnected" }
  | { state: "connected"; site: string; account: string | null; jql: string; count: number; error?: string };

const TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";
const input =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Connect Jira with an API token, choose which issues show, or disconnect. */
export function JiraSettings() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [form, setForm] = useState({ site: "", email: "", token: "" });
  const [jql, setJql] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    const res = await fetch("/api/jira").then((r) => r.json()).catch(() => ({ connected: false }));
    if (!res.connected) return setStatus({ state: "disconnected" });
    setStatus({ state: "connected", site: res.site, account: res.account, jql: res.jql, count: res.issues?.length ?? 0, error: res.error });
    setJql(res.jql);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the connection state
    load();
  }, []);

  async function send(method: string, body?: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/jira", {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    return { ok: res.ok, data };
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await send("POST", form);
    if (!ok) return setMessage({ text: data.error ?? "Couldn't connect.", ok: false });
    setForm({ site: "", email: "", token: "" }); // don't keep the token in the page
    setMessage({ text: `Connected as ${data.account}.`, ok: true });
    load();
  }

  async function saveJql() {
    const { ok, data } = await send("PATCH", { jql });
    setMessage(ok ? { text: `Saved · ${data.count} issue${data.count === 1 ? "" : "s"} match.`, ok: true } : { text: data.error, ok: false });
    if (ok) load();
  }

  async function disconnect() {
    await send("DELETE");
    setMessage({ text: "Jira disconnected. Quests you made from issues stay.", ok: true });
    setStatus({ state: "disconnected" });
  }

  if (status.state === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking…
      </p>
    );
  }

  return (
    <div className="max-w-md space-y-3">
      {status.state === "disconnected" ? (
        <form onSubmit={connect} className="space-y-2">
          <input
            required
            value={form.site}
            onChange={(e) => setForm({ ...form, site: e.target.value })}
            placeholder="yourteam.atlassian.net"
            className={input}
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email you use for Jira"
            className={input}
          />
          <input
            required
            type="password"
            autoComplete="off"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            placeholder="Atlassian API token"
            className={input}
          />
          <p className="text-xs text-muted">
            Make a token at{" "}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Atlassian → Security → API tokens <ExternalLink size={11} />
            </a>
            . It&apos;s encrypted on the server and never shown again; QuestLog only reads your issues.
          </p>
          <button
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Connect Jira
          </button>
        </form>
      ) : (
        <>
          <p className="text-sm">
            Connected to{" "}
            <a href={status.site} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              {status.site.replace("https://", "")}
            </a>
            {status.account && <> as {status.account}</>} ·{" "}
            <span className="text-muted">
              {status.count} open issue{status.count === 1 ? "" : "s"}
            </span>
          </p>
          {status.error && <p className="text-sm text-danger">{status.error}</p>}
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Which issues to show (JQL)</span>
            <textarea value={jql} onChange={(e) => setJql(e.target.value)} rows={3} className={`${input} font-mono text-xs`} />
          </label>
          <div className="flex gap-2">
            <button
              onClick={saveJql}
              disabled={busy || jql === status.jql}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50"
            >
              Save search
            </button>
            <button onClick={disconnect} disabled={busy} className="rounded-md px-3 py-1.5 text-sm text-danger hover:bg-danger-soft">
              Disconnect
            </button>
          </div>
        </>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-xp" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
