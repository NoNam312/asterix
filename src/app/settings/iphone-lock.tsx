"use client";

import { useMemo, useState } from "react";
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
      <div className="flex flex-wrap gap-2">
        <CopyButton label="status link" copied={copied === "status link"} onCopy={() => copy("status link", statusUrl)} />
        <CopyButton label="lock page link" copied={copied === "lock page link"} onCopy={() => copy("lock page link", lockUrl)} />
      </div>

      <ol className="list-decimal space-y-1.5 rounded-lg bg-surface p-3 pl-8 text-sm text-muted">
        <li>
          Open the <strong className="text-ink">Shortcuts</strong> app → <strong className="text-ink">Automation</strong> tab →{" "}
          <strong className="text-ink">+</strong> → <strong className="text-ink">App</strong>.
        </li>
        <li>
          Choose <strong className="text-ink">YouTube</strong> (and any others: Instagram, TikTok…), tick{" "}
          <strong className="text-ink">Is Opened</strong>, pick <strong className="text-ink">Run Immediately</strong>, then{" "}
          <strong className="text-ink">Next</strong> → <strong className="text-ink">New Blank Automation</strong>.
        </li>
        <li>
          Add <strong className="text-ink">Get Contents of URL</strong> and paste your <strong className="text-ink">status link</strong>.
        </li>
        <li>
          Add <strong className="text-ink">If</strong>: <em>Contents of URL</em> <strong className="text-ink">is</strong>{" "}
          <code className="rounded bg-canvas px-1 text-ink">LOCKED</code>.
        </li>
        <li>
          Inside the If, add <strong className="text-ink">Open URLs</strong> and paste your{" "}
          <strong className="text-ink">lock page link</strong>. Tap <strong className="text-ink">Done</strong>.
        </li>
      </ol>
      <p className="text-xs text-faint">
        Now opening YouTube before you hit your daily goal jumps to a QuestLog lock page showing how much XP you need. It
        unlocks by itself once you reach the goal (or use an emergency unlock). Like the Chrome extension, it can be switched
        off in Shortcuts. The XP rules are what keep you honest.
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
