"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Download, KeyRound, Lock, MessageCircle, Puzzle, Target, X } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { NotificationSettings, type NotificationPrefs } from "./notification-settings";
import { createClient } from "@/lib/supabase/client";

type Settings = {
  daily_xp_goal: number;
  blocked_sites: string[];
  allowed_urls: string[];
};

export function SettingsForm({
  initial,
  email,
  needsMigration,
  notificationPrefs,
}: {
  initial: Settings;
  email: string;
  needsMigration: boolean;
  notificationPrefs: NotificationPrefs;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ error?: string; ok?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    setStatus({});
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update(settings).eq("id", auth.user!.id);
    setSaving(false);
    if (error) return setStatus({ error: error.message });
    setSaved(settings);
    setStatus({ ok: true });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to planner
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Signed in as <span className="font-medium text-ink">{email}</span>
      </p>

      {needsMigration && (
        <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          Run <code>supabase/005_focus_lock.sql</code> in the Supabase SQL editor to enable these
          settings.
        </p>
      )}

      <Section id="notifications" icon={<Bell size={16} />} title="Notifications">
        <p className="mb-3 text-sm text-muted">
          Get a reminder on your phone before quests and classes start, when time is up, and before due dates.
        </p>
        <NotificationSettings initial={notificationPrefs} />
      </Section>

      <Section icon={<Target size={16} />} title="Daily XP goal">
        <p className="text-sm text-muted">
          Reaching this unlocks your blocked sites for the rest of the day and keeps your streak going.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={Math.min(settings.daily_xp_goal, 1000)}
            onChange={(e) => setSettings((s) => ({ ...s, daily_xp_goal: Number(e.target.value) }))}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-20 text-right font-semibold tabular-nums">{settings.daily_xp_goal} XP</span>
        </div>
        <p className="mt-1 text-xs text-faint">
          About {Math.round(settings.daily_xp_goal / 60)} hours of medium-difficulty quests.
        </p>
      </Section>

      <Section icon={<Lock size={16} />} title="Blocked sites">
        <p className="text-sm text-muted">
          Locked until you reach your daily goal. Subdomains are included (blocking youtube.com also
          blocks m.youtube.com).
        </p>
        <ListEditor
          items={settings.blocked_sites}
          placeholder="e.g. youtube.com"
          onChange={(blocked_sites) => setSettings((s) => ({ ...s, blocked_sites }))}
        />
      </Section>

      <Section icon={<MessageCircle size={16} />} title="Always allowed (messaging)">
        <p className="text-sm text-muted">
          Pages that stay open even on blocked sites, so you can still reply to messages.
        </p>
        <ListEditor
          items={settings.allowed_urls}
          placeholder="e.g. instagram.com/direct"
          onChange={(allowed_urls) => setSettings((s) => ({ ...s, allowed_urls }))}
        />
      </Section>

      <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-line bg-canvas py-4">
        <button
          onClick={save}
          disabled={!dirty || saving || needsMigration}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {status.ok && !dirty && <span className="text-sm text-xp">Saved ✓</span>}
        {status.error && <span className="text-sm text-danger">{status.error}</span>}
      </div>

      <Section id="extension" icon={<Puzzle size={16} />} title="Chrome extension (focus lock)">
        <p className="text-sm text-muted">
          Install it in every computer and Chrome profile you use. Extensions are installed per
          profile, and websites can&apos;t install them for you.
        </p>
        <a
          href="/questlog-extension.zip"
          download
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Download size={15} /> Download extension (.zip)
        </a>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Unzip it: right-click the downloaded file and choose{" "}
            <strong className="text-ink">Extract All</strong>. Keep the{" "}
            <code className="rounded bg-surface px-1 text-ink">questlog-extension</code> folder
            somewhere permanent (e.g. Documents), not in Downloads, because Chrome needs it to stay.
          </li>
          <li>
            Open <code className="rounded bg-surface px-1 text-ink">chrome://extensions</code> and turn
            on <strong className="text-ink">Developer mode</strong> (top right).
          </li>
          <li>
            Click <strong className="text-ink">Load unpacked</strong> and choose the{" "}
            <code className="rounded bg-surface px-1 text-ink">questlog-extension</code> folder.
          </li>
          <li>Pin the QuestLog icon, click it, and sign in with this account.</li>
          <li>The badge shows how much XP you still need today. ✓ means you&apos;re unlocked.</li>
        </ol>
        <p className="mt-2 text-xs text-faint">
          Settings you save here reach the extension within a minute (or click Refresh in its popup).
          To update the extension later, download it again, replace the folder, and click ↻ on its card
          in <code>chrome://extensions</code>.
        </p>
      </Section>

      <Section icon={<KeyRound size={16} />} title="Change password">
        <p className="mb-3 text-sm text-muted">Used to log in to the app and the Chrome extension.</p>
        <ChangePasswordForm />
      </Section>
    </main>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="grid size-7 place-items-center rounded-md bg-surface text-muted">{icon}</span>
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function normalize(site: string) {
  return site
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function ListEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function add() {
    const site = normalize(value);
    if (!site || !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(site)) return;
    if (!items.includes(site)) onChange([...items, site]);
    setValue("");
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="flex items-center gap-1 rounded-md bg-surface py-1 pl-2 pr-1 text-sm"
          >
            {item}
            <button
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="rounded p-0.5 text-faint hover:bg-surface-hover hover:text-ink"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={placeholder}
          className="min-w-40 flex-1 px-2 py-1 text-sm outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}
