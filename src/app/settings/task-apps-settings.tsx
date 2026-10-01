"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TASK_APPS, TASK_PROVIDERS, type TaskProvider } from "@/lib/task-apps";

const input =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Connect Todoist, GitHub, Trello, Linear, Asana and ClickUp, one row each. */
export function TaskAppsSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [connected, setConnected] = useState<Map<TaskProvider, string | null> | null>(null);
  const [ready, setReady] = useState(true);
  const [open, setOpen] = useState<TaskProvider | null>(null);
  const [form, setForm] = useState<{ token: string; key: string }>({ token: "", key: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    const { data, error } = await supabase.from("task_connections").select("provider, account_name");
    setReady(!error);
    setConnected(new Map(((data ?? []) as { provider: TaskProvider; account_name: string | null }[]).map((c) => [c.provider, c.account_name])));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading which apps are connected
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  async function connect(provider: TaskProvider, e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...form }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ text: data.error ?? "Couldn't connect.", ok: false });
    setForm({ token: "", key: "" }); // don't keep the token in the page
    setOpen(null);
    setMessage({ text: `${TASK_APPS[provider].name} connected as ${data.account}.`, ok: true });
    load();
  }

  async function disconnect(provider: TaskProvider) {
    setBusy(true);
    await fetch(`/api/tasks?provider=${provider}`, { method: "DELETE" });
    setBusy(false);
    setMessage({ text: `${TASK_APPS[provider].name} disconnected. Quests you made from its tasks stay.`, ok: true });
    load();
  }

  if (!connected) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking…
      </p>
    );
  }
  if (!ready) {
    return <p className="text-sm text-muted">Run supabase/020_task_apps.sql in the Supabase SQL Editor to connect these apps.</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {TASK_PROVIDERS.map((p) => {
          const app = TASK_APPS[p];
          const isOn = connected.has(p);
          return (
            <li key={p} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white" style={{ background: app.color }}>
                  {app.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{app.name}</span>
                  {isOn && <span className="block truncate text-xs text-muted">Connected as {connected.get(p) ?? app.name}</span>}
                </span>
                {isOn ? (
                  <button
                    onClick={() => disconnect(p)}
                    disabled={busy}
                    className="rounded-md px-2.5 py-1 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setOpen(open === p ? null : p);
                      setForm({ token: "", key: "" });
                      setMessage(null);
                    }}
                    className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface"
                  >
                    {open === p ? "Cancel" : "Connect"}
                  </button>
                )}
              </div>
              {open === p && !isOn && (
                <form onSubmit={(e) => connect(p, e)} className="mt-3 space-y-2">
                  {app.fields.map((f) => (
                    <input
                      key={f.key}
                      required
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={`${app.name} ${f.label}`}
                      className={input}
                    />
                  ))}
                  <p className="text-xs text-muted">
                    <a href={app.help.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                      {app.help.text} <ExternalLink size={11} />
                    </a>
                    . It&apos;s encrypted on the server and never shown again.
                  </p>
                  <button
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />} Connect {app.name}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {message && <p className={`text-sm ${message.ok ? "text-xp" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
