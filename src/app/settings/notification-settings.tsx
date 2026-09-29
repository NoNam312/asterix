"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Loader2, Send, Share } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type NotificationPrefs = {
  notify_quests: boolean;
  notify_classes: boolean;
  notify_deadlines: boolean;
  notify_time_up: boolean;
  remind_minutes: number;
};

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** The browser's view of this device: can it receive push, and is it the installed app? */
function readDevice() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, standalone, supported };
}

const noopSubscribe = () => () => {};
const serverDevice = { ios: false, standalone: false, supported: false };
let cachedDevice: ReturnType<typeof readDevice> | undefined;

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function NotificationSettings({ initial }: { initial: NotificationPrefs }) {
  const supabase = useMemo(() => createClient(), []);
  const device = useSyncExternalStore(
    noopSubscribe,
    () => (cachedDevice ??= readDevice()),
    () => serverDevice,
  );
  const [prefs, setPrefs] = useState(initial);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  // Is this device already subscribed?
  useEffect(() => {
    if (!device.supported) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscription(sub ?? null))
      .catch(() => undefined);
  }, [device.supported]);

  async function turnOn() {
    setBusy("Turning on…");
    setMessage({});
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications were blocked. Allow them in your device settings.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          device: deviceName(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      setSubscription(sub);
      setMessage({ ok: "Notifications are on for this device." });
    } catch (err) {
      setMessage({ error: (err as Error).message });
    }
    setBusy(null);
  }

  async function turnOff() {
    if (!subscription) return;
    setBusy("Turning off…");
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe().catch(() => undefined);
    setSubscription(null);
    setMessage({ ok: "Notifications are off for this device." });
    setBusy(null);
  }

  async function test() {
    setBusy("Sending…");
    setMessage({});
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription?.endpoint }),
    });
    const body = await res.json();
    setMessage(res.ok ? { ok: "Test sent. It should arrive in a few seconds." } : { error: body.error });
    setBusy(null);
  }

  async function update<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", auth.user!.id);
    if (error) setMessage({ error: error.message });
  }

  return (
    <div className="space-y-4">
      {device.ios && !device.standalone ? (
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="font-medium">On iPhone, add QuestLog to your Home Screen first</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
            <li>
              In Safari, tap <Share size={13} className="inline" /> <strong className="text-ink">Share</strong>, then{" "}
              <strong className="text-ink">Add to Home Screen</strong>.
            </li>
            <li>Open QuestLog from the Home Screen and come back to Settings.</li>
          </ol>
          <p className="mt-1 text-xs text-faint">iPhones only allow notifications from apps on the Home Screen (iOS 16.4+).</p>
        </div>
      ) : !device.supported ? (
        <p className="rounded-lg bg-surface p-3 text-sm text-muted">This browser can&apos;t receive notifications.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {subscription ? (
            <>
              <span className="flex items-center gap-1.5 rounded-md bg-xp-soft px-2.5 py-1.5 text-sm font-medium text-xp">
                <Bell size={14} /> On for this device
              </span>
              <button onClick={test} disabled={!!busy} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60">
                <Send size={13} /> Send a test
              </button>
              <button onClick={turnOff} disabled={!!busy} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-60">
                <BellOff size={13} /> Turn off
              </button>
            </>
          ) : (
            <button
              onClick={turnOn}
              disabled={!!busy || !PUBLIC_KEY}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              <Bell size={14} /> Turn on notifications on this device
            </button>
          )}
          {busy && <Loader2 size={14} className="animate-spin text-muted" />}
        </div>
      )}
      {message.ok && <p className="text-sm text-xp">{message.ok}</p>}
      {message.error && <p className="text-sm text-danger">{message.error}</p>}

      <div className="divide-y divide-line rounded-lg border border-line">
        <Toggle label="Before my quests start" checked={prefs.notify_quests} onChange={(v) => update("notify_quests", v)} />
        <Toggle label="Before imported classes start" checked={prefs.notify_classes} onChange={(v) => update("notify_classes", v)} />
        <Toggle label="When a timed quest's time is up" checked={prefs.notify_time_up} onChange={(v) => update("notify_time_up", v)} />
        <Toggle label="The day before a due date" checked={prefs.notify_deadlines} onChange={(v) => update("notify_deadlines", v)} />
        <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          Remind me
          <select
            value={prefs.remind_minutes}
            onChange={(e) => update("remind_minutes", Number(e.target.value))}
            className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
          >
            {[0, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "when it starts" : `${m} min before`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
    </label>
  );
}
