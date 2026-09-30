"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Clock,
  Download,
  KeyRound,
  ListChecks,
  Lock,
  LogOut,
  MessageCircle,
  Palette,
  Puzzle,
  ShieldAlert,
  Smartphone,
  SquareKanban,
  Tags,
  Target,
  X,
} from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { NotificationSettings, type NotificationPrefs } from "./notification-settings";
import { IphoneLock } from "./iphone-lock";
import { AppearanceSettings } from "./appearance-settings";
import { JiraSettings } from "./jira-settings";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, CATEGORY_KEYS, type Category, type LockMode } from "@/lib/quests";

const LOCK_MODES: { value: LockMode; title: string; description: string; icon: typeof Clock }[] = [
  {
    value: "during_quests",
    title: "During quests",
    description: "Locked while a quest or class is on. Free between quests and at night.",
    icon: Clock,
  },
  {
    value: "until_done",
    title: "Until quests are done",
    description: "Locked while you still have quests left today; free after the last one ends.",
    icon: ListChecks,
  },
  {
    value: "all_day",
    title: "All day until the goal",
    description: "Strict: locked all day until you reach your daily XP goal.",
    icon: ShieldAlert,
  },
];

const GOAL_PRESETS = [100, 200, 300, 500];

/** The page's sections, grouped as in the side menu. */
const NAV: { group: string; items: { id: string; label: string; icon: typeof Clock }[] }[] = [
  {
    group: "General",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "goal", label: "Daily goal", icon: Target },
    ],
  },
  {
    group: "Focus lock",
    items: [
      { id: "lock", label: "Lock rules", icon: Lock },
      { id: "sites", label: "Sites", icon: MessageCircle },
      { id: "extension", label: "Chrome extension", icon: Puzzle },
      { id: "iphone-lock", label: "iPhone lock", icon: Smartphone },
    ],
  },
  { group: "Integrations", items: [{ id: "jira", label: "Jira", icon: SquareKanban }] },
  { group: "Account", items: [{ id: "account", label: "Account", icon: KeyRound }] },
];

type Settings = {
  daily_xp_goal: number;
  lock_mode: LockMode;
  lock_categories: Category[];
  blocked_sites: string[];
  allowed_urls: string[];
};

export function SettingsForm({
  initial,
  email,
  needsMigration,
  notificationPrefs,
  lockToken,
}: {
  initial: Settings;
  email: string;
  needsMigration: boolean;
  notificationPrefs: NotificationPrefs;
  lockToken: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ error?: string; ok?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const active = useActiveSection();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  async function save() {
    setSaving(true);
    setStatus({});
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update(settings).eq("id", auth.user!.id);
    setSaving(false);
    if (error) return setStatus({ error: error.message });
    setSaved(settings);
    setStatus({ ok: true });
    setTimeout(() => setStatus((s) => (s.ok ? {} : s)), 2500);
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-ink">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Planner</span>
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
          <span className="ml-auto hidden truncate text-xs text-muted sm:block">{email}</span>
        </div>
        {/* Phones: sections as a scrollable row of tabs */}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {NAV.flatMap((g) => g.items).map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                active === item.id ? "bg-accent text-white" : "bg-surface text-muted"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        {/* Laptop: sticky side menu */}
        <nav className="sticky top-20 hidden self-start lg:block">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.group}</p>
              <ul className="mt-1 space-y-0.5">
                {g.items.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                        active === id ? "bg-canvas font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
                      }`}
                    >
                      <Icon size={14} className={active === id ? "text-accent" : ""} /> {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main className="min-w-0 space-y-8 pb-24">
          {needsMigration && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              Run <code>supabase/005_focus_lock.sql</code> in the Supabase SQL editor to enable these settings.
            </p>
          )}

          <Group title="General">
            <Card id="appearance" icon={Palette} title="Appearance" description="Saved on this device, so your phone and laptop can differ.">
              <AppearanceSettings />
            </Card>

            <Card
              id="notifications"
              icon={Bell}
              title="Notifications"
              description="Reminders on your phone before quests and classes start, when time is up, and before due dates."
            >
              <NotificationSettings initial={notificationPrefs} />
            </Card>

            <Card
              id="goal"
              icon={Target}
              title="Daily XP goal"
              description="Reaching it unlocks your apps for the rest of the day and keeps your streak going."
            >
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <p className="text-4xl font-semibold tabular-nums">
                  {settings.daily_xp_goal}
                  <span className="ml-1 text-base font-normal text-muted">XP / day</span>
                </p>
                <div className="flex gap-1.5">
                  {GOAL_PRESETS.map((xp) => (
                    <button
                      key={xp}
                      type="button"
                      onClick={() => set("daily_xp_goal", xp)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        settings.daily_xp_goal === xp ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface"
                      }`}
                    >
                      {xp}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={50}
                max={1000}
                step={50}
                value={Math.min(settings.daily_xp_goal, 1000)}
                onChange={(e) => set("daily_xp_goal", Number(e.target.value))}
                className="mt-4 w-full accent-[var(--color-accent)]"
                aria-label="Daily XP goal"
              />
              <p className="mt-1 text-xs text-faint">
                About {Math.max(1, Math.round(settings.daily_xp_goal / 60))} hour
                {Math.round(settings.daily_xp_goal / 60) === 1 ? "" : "s"} of medium-difficulty quests.
              </p>
            </Card>
          </Group>

          <Group title="Focus lock">
            <Card
              id="lock"
              icon={Lock}
              title="Lock rules"
              description="For the Chrome extension and the iPhone lock. Reaching your goal or an emergency unlock always unlocks everything."
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">When</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {LOCK_MODES.map(({ value, title, description, icon: Icon }) => {
                  const on = settings.lock_mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("lock_mode", value)}
                      className={`rounded-lg border p-3 text-left transition ${
                        on ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line hover:bg-surface"
                      }`}
                    >
                      <Icon size={16} className={on ? "text-accent" : "text-muted"} />
                      <span className="mt-2 block text-sm font-medium">{title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{description}</span>
                    </button>
                  );
                })}
              </div>

              <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                <Tags size={12} /> Which quests count
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_KEYS.map((key) => {
                  const cat = CATEGORIES[key];
                  const on = settings.lock_categories.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set("lock_categories", on ? settings.lock_categories.filter((c) => c !== key) : [...settings.lock_categories, key])
                      }
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition"
                      style={
                        on
                          ? { background: cat.soft, borderColor: cat.color, color: cat.color }
                          : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
                      }
                    >
                      <span
                        className="grid size-4 place-items-center rounded border text-[10px]"
                        style={{ borderColor: on ? cat.color : "var(--color-line)", background: on ? cat.color : "transparent", color: "white" }}
                      >
                        {on && "✓"}
                      </span>
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-faint">
                Classes from your timetable count as Study.
                {settings.lock_mode === "all_day" && " “All day until the goal” ignores this and is always strict."}
              </p>
              {settings.lock_categories.length === 0 && settings.lock_mode !== "all_day" && (
                <p className="mt-1 text-xs text-danger">With nothing ticked, your apps will never be locked.</p>
              )}
            </Card>

            <Card id="sites" icon={MessageCircle} title="Sites" description="What gets locked, and what stays open so you can still reply to messages.">
              <p className="text-sm font-medium">Blocked</p>
              <p className="text-xs text-muted">Subdomains are included: blocking youtube.com also blocks m.youtube.com.</p>
              <ListEditor items={settings.blocked_sites} placeholder="Add a site, e.g. youtube.com" onChange={(v) => set("blocked_sites", v)} />
              <p className="mt-5 text-sm font-medium">Always allowed</p>
              <p className="text-xs text-muted">Pages that stay open even on blocked sites.</p>
              <ListEditor items={settings.allowed_urls} placeholder="Add a page, e.g. instagram.com/direct" onChange={(v) => set("allowed_urls", v)} />
            </Card>

            <Card
              id="extension"
              icon={Puzzle}
              title="Chrome extension"
              description="Install it in every computer and Chrome profile you use; websites can't install extensions for you."
            >
              <a
                href="/questlog-extension.zip"
                download
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Download size={15} /> Download extension (.zip)
              </a>
              <ol className="mt-4 space-y-2 text-sm text-muted">
                {[
                  <>
                    Unzip it (right-click → <strong className="text-ink">Extract All</strong>) and keep the{" "}
                    <Code>questlog-extension</Code> folder somewhere permanent, like Documents.
                  </>,
                  <>
                    Open <Code>chrome://extensions</Code> and turn on <strong className="text-ink">Developer mode</strong> (top right).
                  </>,
                  <>
                    Click <strong className="text-ink">Load unpacked</strong> and choose the <Code>questlog-extension</Code> folder.
                  </>,
                  <>Pin the QuestLog icon, click it, and sign in with this account.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-ink">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-faint">
                The badge shows the XP you still need today (✓ = unlocked). Changes here reach the extension within a minute. To
                update it, download again, replace the folder and click ↻ on its card in <code>chrome://extensions</code>.
              </p>
            </Card>

            <Card
              id="iphone-lock"
              icon={Smartphone}
              title="iPhone app lock"
              description="Make YouTube, Instagram and other apps open a QuestLog lock page until you reach your goal, using a Shortcuts automation."
            >
              <IphoneLock initialToken={lockToken} />
            </Card>
          </Group>

          <Group title="Integrations">
            <Card
              id="jira"
              icon={SquareKanban}
              title="Jira"
              description="See issues assigned to you, with due dates, in the planner and drag them onto your calendar."
            >
              <JiraSettings />
            </Card>
          </Group>

          <Group title="Account">
            <Card id="account" icon={KeyRound} title="Account" description={`Signed in as ${email}. The password is used for the app and the Chrome extension.`}>
              <ChangePasswordForm />
              <form action={signOut} className="mt-5 border-t border-line pt-4">
                <button className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink">
                  <LogOut size={14} /> Log out
                </button>
              </form>
            </Card>
          </Group>
        </main>
      </div>

      {/* Appears only when there's something to save. */}
      {(dirty || status.ok || status.error) && (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 shadow-xl">
          {dirty ? (
            <>
              <span className="flex-1 text-sm">{status.error ? <span className="text-danger">{status.error}</span> : "Unsaved changes"}</span>
              <button
                onClick={() => {
                  setSettings(saved);
                  setStatus({});
                }}
                className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface"
              >
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving || needsMigration}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <span className="text-sm text-xp">Saved ✓</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Which section is on screen, for highlighting the menu. */
function useActiveSection() {
  const [active, setActive] = useState(NAV[0].items[0].id);
  useEffect(() => {
    const sections = NAV.flatMap((g) => g.items).map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);
  return active;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Card({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: typeof Clock;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-xl border border-line bg-canvas p-5 shadow-sm">
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface px-1 text-ink">{children}</code>;
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
    <div className="mt-2 rounded-lg border border-line p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="flex items-center gap-1 rounded-md bg-surface py-1 pl-2 pr-1 text-sm">
            {item}
            <button
              type="button"
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
          className="min-w-40 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}
