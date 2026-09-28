"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

type Mode = "login" | "signup";

export function AuthForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(signIn, {
    error: initialError,
  });
  const [signupState, signupAction, signupPending] = useActionState<AuthState, FormData>(
    signUp,
    {},
  );

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isLogin ? "Welcome back" : "Start your quest log"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {isLogin ? "Log in to see today's quests." : "Create an account to plan your days."}
      </p>

      <div className="mt-6 grid grid-cols-2 rounded-lg bg-surface p-1 text-sm">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-1.5 font-medium transition ${
              mode === m ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form action={isLogin ? loginAction : signupAction} className="mt-6 space-y-4" key={mode}>
        {!isLogin && (
          <Field label="Username" name="username" placeholder="studyhero" autoComplete="username" />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          placeholder={isLogin ? "••••••••" : "At least 8 characters"}
          autoComplete={isLogin ? "current-password" : "new-password"}
        />

        {state.error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
        )}
        {state.message && (
          <p className="rounded-md bg-xp-soft px-3 py-2 text-sm text-xp">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        required
        {...props}
        className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
    </label>
  );
}
