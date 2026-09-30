import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Insights } from "@/components/insights/insights";

export const metadata = { title: "Insights · QuestLog" };

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp, daily_xp_goal")
    .eq("id", auth.user.id)
    .single();

  return <Insights totalXp={profile?.total_xp ?? 0} goal={profile?.daily_xp_goal ?? 300} />;
}
