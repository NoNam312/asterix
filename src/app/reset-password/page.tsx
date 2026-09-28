"use client";

import { useRouter } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";

// Reached from the password-reset email (the link signs the user in first).
export default function ResetPasswordPage() {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">You&apos;ll use it to log in to the app and the extension.</p>
        <ChangePasswordForm onDone={() => setTimeout(() => router.push("/"), 1200)} />
      </div>
    </main>
  );
}
