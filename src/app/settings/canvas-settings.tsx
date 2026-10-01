"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

type Status =
  | { state: "loading" }
  | { state: "not-ready" }
  | { state: "disconnected" }
  | { state: "connected"; site: string; account: string | null; courses: number; error?: string };

const input =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Connect Canvas with an access token to see your marks and each assignment's weighting. */
export function CanvasSettings() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [form, setForm] = useState({ url: "canvas.lms.unimelb.edu.au", token: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    const res = await fetch("/api/canvas").then((r) => r.json()).catch(() => ({ connected: false, ready: true }));
    if (!res.ready) return setStatus({ state: "not-ready" });
    if (!res.connected) return setStatus({ state: "disconnected" });
    setStatus({ state: "connected", site: res.site, account: res.account, courses: res.courses?.length ?? 0, error: res.error });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the connection state
    load();
  }, []);

  const site = form.url.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "your Canvas";

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ text: data.error ?? "Couldn't connect.", ok: false });
    setForm((f) => ({ ...f, token: "" })); // don't keep the token in the page
    setMessage({ text: `Connected as ${data.account}.`, ok: true });
    load();
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/canvas", { method: "DELETE" });
    setBusy(false);
    setMessage({ text: "Canvas disconnected.", ok: true });
    setStatus({ state: "disconnected" });
  }

  if (status.state === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking…
      </p>
    );
  }
  if (status.state === "not-ready") {
    return <p className="text-sm text-muted">Run supabase/021_canvas.sql in the Supabase SQL Editor to connect Canvas.</p>;
  }

  return (
    <div className="max-w-md space-y-3">
      {status.state === "disconnected" ? (
        <form onSubmit={connect} className="space-y-2">
          <input required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="canvas.lms.unimelb.edu.au" className={input} />
          <input
            required
            type="password"
            autoComplete="off"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            placeholder="Canvas access token"
            className={input}
          />
          <p className="text-xs text-muted">
            In Canvas:{" "}
            <a href={`https://${site}/profile/settings`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Account → Settings → New access token <ExternalLink size={11} />
            </a>
            . QuestLog only reads your courses, marks and assignments. The token is encrypted on the server.
          </p>
          <button
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Connect Canvas
          </button>
        </form>
      ) : (
        <>
          <p className="text-sm">
            Connected to <span className="font-medium">{status.site.replace("https://", "")}</span>
            {status.account && <> as {status.account}</>} ·{" "}
            <span className="text-muted">
              {status.courses} subject{status.courses === 1 ? "" : "s"}
            </span>
          </p>
          {status.error && <p className="text-sm text-danger">{status.error}</p>}
          <button onClick={disconnect} disabled={busy} className="rounded-md px-3 py-1.5 text-sm text-danger hover:bg-danger-soft">
            Disconnect
          </button>
        </>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-xp" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
