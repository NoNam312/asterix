import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Planner } from "@/components/planner/planner";

export default async function Home() {
  if (!isSupabaseConfigured) redirect("/login");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  return (
    <Planner
      profile={
        profile ?? {
          username: auth.user.email?.split("@")[0] ?? "adventurer",
          total_xp: 0,
          daily_xp_goal: 300,
        }
      }
    />
  );
}
