"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signUp, type AuthState } from "./actions";

type Mode = "login" | "signup" | "reset";

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  login: { title: "Welcome back", subtitle: "Log in to see today's quests.", submit: "Log in" },
  signup: {
    title: "Start your quest log",
    subtitle: "Create an account to plan your days.",
    submit: "Create account",
  },
  reset: {
    title: "Reset your password",
    subtitle: "We'll email you a link to choose a new one.",
    submit: "Send reset link",
  },
};

export function AuthForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(signIn, {
    error: initialError,
  });
  const [signupState, signupAction, signupPending] = useActionState<AuthState, FormData>(
    signUp,
    {},
  );
  const [resetState, resetAction, resetPending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {},
  );

  const { state, action, pending } = {
    login: { state: loginState, action: loginAction, pending: loginPending },
    signup: { state: signupState, action: signupAction, pending: signupPending },
    reset: { state: resetState, action: resetAction, pending: resetPending },
  }[mode];
  const copy = COPY[mode];

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted">{copy.subtitle}</p>

      {mode !== "reset" && (
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
      )}

      <form action={action} className="mt-6 space-y-4" key={mode}>
        {mode === "signup" && (
          <Field label="Username" name="username" placeholder="studyhero" autoComplete="username" />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />
        {mode !== "reset" && (
          <div>
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder={mode === "login" ? "••••••••" : "At least 8 characters"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="mt-1.5 text-xs text-muted hover:text-accent"
              >
                Forgot password?
              </button>
            )}
          </div>
        )}

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
          {pending ? "Please wait…" : copy.submit}
        </button>

        {mode === "reset" && (
          <button
            type="button"
            onClick={() => setMode("login")}
            className="w-full text-sm text-muted hover:text-ink"
          >
            Back to log in
          </button>
        )}
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
