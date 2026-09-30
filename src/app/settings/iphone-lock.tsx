"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Links and steps for an iPhone Shortcuts automation that sends blocked apps to a lock page. */
export function IphoneLock({ initialToken }: { initialToken: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const tz = typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const statusUrl = token ? `${origin}/api/lock/${token}?tz=${encodeURIComponent(tz)}` : "";
  const lockUrl = token ? `${origin}/lock/${token}?tz=${encodeURIComponent(tz)}` : "";

  async function rotate() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("rotate_lock_token");
    setBusy(false);
    setConfirmReset(false);
    if (error) return setError(error.message);
    setToken(data as string);
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000);
  }

  if (!token) {
    return (
      <div>
        <button
          onClick={rotate}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          <KeyRound size={14} /> Create my iPhone lock links
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Do this on your iPhone, so you can copy the links straight into the Shortcuts app. Takes about 2 minutes.
      </p>

      <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
        <ol className="space-y-4">
          <Step n={1} title="Start a new automation">
            Open the <b>Shortcuts</b> app → <b>Automation</b> tab (bottom) → <b>+</b> → <b>App</b>.
          </Step>
          <Step n={2} title="Pick the apps to lock">
            Tap <b>Choose</b> and select YouTube, Instagram, TikTok… → tick <b>Is Opened</b> → select{" "}
            <b>Run Immediately</b> → <b>Next</b> → <b>New Blank Automation</b>.
          </Step>
          <Step n={3} title="Ask QuestLog if you're locked">
            <span className="mb-2 block">
              Search <b>Get Contents of URL</b>, add it, tap the blue <b>URL</b> and paste:
            </span>
            <CopyButton label="status link" copied={copied === "status link"} onCopy={() => copy("status link", statusUrl)} />
          </Step>
          <Step n={4} title="Turn the answer into text">
            Search <b>Get Text from Input</b> and add it. It should read <i>Get text from Contents of URL</i>.
          </Step>
          <Step n={5} title="Check for LOCKED">
            Search <b>If</b> and add it. The first box must be the <b className="text-gold">yellow Text</b> (tap it to
            change if it shows the green <i>Contents of URL</i>). Tap <b>Condition</b> → <b>is</b> → type{" "}
            <code className="rounded bg-surface px-1 text-ink">LOCKED</code>.
          </Step>
          <Step n={6} title="Show the lock page">
            <span className="mb-2 block">
              Search <b>Open URLs</b> and add it. <b>Hold and drag it up</b> so it sits between <i>If</i> and{" "}
              <i>Otherwise</i> (it becomes indented), then tap its blue <b>URL</b> and paste:
            </span>
            <CopyButton label="lock page link" copied={copied === "lock page link"} onCopy={() => copy("lock page link", lockUrl)} />
          </Step>
          <Step n={7} title="Test and save">
            Tap <b>▶</b> at the bottom right: under your goal, the 🔒 lock page opens. Then tap <b>✓</b> to save and try
            opening YouTube.
          </Step>
        </ol>

        <figure className="md:sticky md:top-4 md:self-start">
          <Image
            src="/help/iphone-shortcut.png"
            alt="The finished automation: Get contents of your status link, Get text from Contents of URL, If Text is LOCKED, then Open your lock page link."
            width={645}
            height={780}
            className="w-full rounded-xl border border-line"
          />
          <figcaption className="mt-1.5 text-center text-xs text-faint">What it should look like when you&apos;re done</figcaption>
        </figure>
      </div>

      <details className="rounded-lg border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">If it doesn&apos;t work</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
          <li>
            <b>The If only offers file options, or says “couldn&apos;t convert from Text to URL”:</b> its first box is the green{" "}
            <i>Contents of URL</i>. Tap it and pick the yellow <b>Text</b> from step 4.
          </li>
          <li>
            <b>YouTube opens normally even though you&apos;re locked:</b> <i>Open URLs</i> is probably under <i>End If</i>. Drag it
            up between <i>If</i> and <i>Otherwise</i>.
          </li>
          <li>
            <b>It asks before running:</b> edit the automation and choose <b>Run Immediately</b>.
          </li>
        </ul>
      </details>

      <p className="text-xs text-faint">
        Opening a locked app jumps to a page showing how much XP you still need; it unlocks by itself once you reach the goal
        (or use an emergency unlock). Like the Chrome extension, it can be switched off in Shortcuts. The XP rules are what keep
        you honest.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">
        These links are private.{" "}
        {confirmReset ? (
          <>
            Reset them? Your automation will need the new links.{" "}
            <button onClick={rotate} disabled={busy} className="font-medium text-danger hover:underline">
              Reset
            </button>{" "}
            <button onClick={() => setConfirmReset(false)} className="hover:underline">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 text-accent hover:underline">
            <RefreshCw size={11} /> Reset links
          </button>
        )}
      </p>
    </div>
  );
}

function CopyButton({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium hover:bg-surface"
    >
      {copied ? <Check size={12} className="text-xp" /> : <Copy size={12} />}
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0 text-sm text-muted [&_b]:font-semibold [&_b]:text-ink">
        <p className="font-medium text-ink">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  );
}
