"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Sets a new password for the signed-in user (also used after a reset-email link). */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [result, setResult] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password"));
    if (password.length < 8) return setResult({ error: "Use at least 8 characters." });
    if (password !== data.get("confirm")) return setResult({ error: "The passwords don't match." });

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) return setResult({ error: error.message });
    form.reset();
    setResult({ ok: true });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="New password"
          className={inputClass}
        />
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Repeat new password"
          className={inputClass}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
        {result.ok && <span className="text-sm text-xp">Password updated ✓</span>}
        {result.error && <span className="text-sm text-danger">{result.error}</span>}
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft";
