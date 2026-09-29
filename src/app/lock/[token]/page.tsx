import type { Metadata } from "next";
import Link from "next/link";
import { Swords } from "lucide-react";
import { getLockStatus } from "@/lib/lock-status";

export const metadata: Metadata = { title: "Locked · QuestLog", robots: { index: false } };
export const dynamic = "force-dynamic";

// Opened by the iPhone Shortcuts automation when a blocked app (e.g. YouTube) is launched.
export default async function LockPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { tz, app } = await searchParams;
  const status = await getLockStatus(token, typeof tz === "string" ? tz : "UTC");
  const appName = typeof app === "string" && app.length <= 40 ? app : "This app";

  if (!status) {
    return (
      <Shell>
        <p className="text-4xl">🔗</p>
        <h1 className="mt-2 text-xl font-semibold">This lock link isn&apos;t valid</h1>
        <p className="mt-1 text-sm text-muted">Create a new one in QuestLog → Settings → iPhone app lock.</p>
      </Shell>
    );
  }

  const left = Math.max(0, status.goal - status.earned);
  const until = status.unlocked_until ? new Date(status.unlocked_until) : null;
  const emergency = until && until > new Date() && status.earned < status.goal;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-ink text-white">
            <Swords size={14} />
          </span>
          QuestLog
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            status.unlocked ? "bg-xp-soft text-xp" : "bg-accent-soft text-accent"
          }`}
        >
          {status.unlocked ? "🔓 Unlocked" : "🔒 Locked"}
        </span>
      </div>

      <p className="mt-6 text-5xl">{status.unlocked ? "🔓" : "🔒"}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {status.unlocked ? `${appName} is unlocked` : `${appName} is locked`}
      </h1>
      <p className="mt-1 text-muted">
        {status.unlocked
          ? emergency
            ? "Emergency unlock is active. Make it count."
            : "Daily goal reached. You've earned your break, so switch back to the app."
          : `Earn ${left} more XP today to unlock it.`}
      </p>

      <div className="mt-6">
        <p className="text-3xl font-bold tabular-nums">
          {status.earned}
          <span className="text-sm font-medium text-muted"> / {status.goal} XP today</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-xp"
            style={{ width: `${Math.min(100, (status.earned / Math.max(1, status.goal)) * 100)}%` }}
          />
        </div>
      </div>

      {!status.unlocked && (
        <Link
          href="/"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-accent py-3 text-sm font-medium text-white"
        >
          Go to my quests
        </Link>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-canvas p-7 shadow-sm">{children}</div>
    </main>
  );
}
