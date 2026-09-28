import { redirect } from "next/navigation";
import { LogOut, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { signOut } from "./login/actions";

// Placeholder home screen. The calendar planner replaces this in Stage 2.
export default async function Home() {
  if (!isSupabaseConfigured) redirect("/login");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, total_xp, daily_xp_goal")
    .eq("id", auth.user.id)
    .single();

  const level = Math.floor((profile?.total_xp ?? 0) / 500) + 1;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-line bg-surface p-4">
        <div className="flex items-center gap-2 px-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-ink text-white">
            <Swords size={14} />
          </span>
          QuestLog
        </div>
        <div className="mt-6 rounded-lg bg-canvas p-3 text-sm shadow-sm">
          <p className="font-medium">{profile?.username ?? auth.user.email}</p>
          <p className="text-xs text-muted">
            Level {level} · {profile?.total_xp ?? 0} XP
          </p>
        </div>
        <form action={signOut} className="mt-auto">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-ink">
            <LogOut size={14} /> Log out
          </button>
        </form>
      </aside>

      <main className="flex-1 p-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile?.username ?? "adventurer"} 👋
        </h1>
        <p className="mt-1 text-muted">
          Daily goal: {profile?.daily_xp_goal ?? 300} XP. The calendar planner arrives in Stage 2.
        </p>
      </main>
    </div>
  );
}
