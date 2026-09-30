import { Swords } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthForm } from "./auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Plan your day.
            <br />
            <span className="text-muted">Turn every task into a quest.</span>
          </h2>
          <QuestPreview />
        </div>
        <p className="text-xs text-faint">Built for exam season.</p>
      </section>

      <section className="flex flex-col items-center justify-center p-6">
        <div className="mb-10 lg:hidden">
          <Logo />
        </div>
        {isSupabaseConfigured ? (
          <AuthForm initialError={error === "confirm" ? "That confirmation link is invalid or expired." : undefined} />
        ) : (
          <SetupNotice />
        )}
      </section>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-md bg-ink text-canvas">
        <Swords size={16} />
      </span>
      QuestLog
    </div>
  );
}

const PREVIEW = [
  { time: "09:00", title: "Calculus past paper", rank: "A", xp: 120, done: true },
  { time: "11:30", title: "Gym: push day", rank: "C", xp: 60, done: true },
  { time: "14:00", title: "Biology flashcards", rank: "D", xp: 40, done: false },
];

function QuestPreview() {
  const earned = PREVIEW.filter((q) => q.done).reduce((s, q) => s + q.xp, 0);
  return (
    <div className="mt-8 rounded-xl border border-line bg-canvas p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Today</span>
        <span>
          <span className="font-semibold text-xp">{earned}</span> / 300 XP
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-xp" style={{ width: `${(earned / 300) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {PREVIEW.map((q) => (
          <li key={q.title} className="flex items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm">
            <span className="w-10 text-xs text-faint">{q.time}</span>
            <span className={`flex-1 ${q.done ? "text-muted line-through" : ""}`}>{q.title}</span>
            <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">{q.rank}</span>
            <span className="w-12 text-right text-xs text-xp">+{q.xp}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="max-w-sm rounded-xl border border-line bg-surface p-6 text-sm">
      <h1 className="text-lg font-semibold">Connect Supabase</h1>
      <p className="mt-2 text-muted">
        Copy <code className="rounded bg-canvas px-1">.env.local.example</code> to{" "}
        <code className="rounded bg-canvas px-1">.env.local</code>, paste your Supabase URL and
        publishable key, then restart <code className="rounded bg-canvas px-1">npm run dev</code>.
      </p>
    </div>
  );
}
