import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  return (
    <SettingsForm
      initial={{
        daily_xp_goal: profile?.daily_xp_goal ?? 300,
        blocked_sites: profile?.blocked_sites ?? [],
        allowed_urls: profile?.allowed_urls ?? [],
      }}
      email={auth.user.email ?? ""}
      lockToken={profile?.lock_token ?? null}
      notificationPrefs={{
        notify_quests: profile?.notify_quests ?? true,
        notify_classes: profile?.notify_classes ?? true,
        notify_deadlines: profile?.notify_deadlines ?? true,
        notify_time_up: profile?.notify_time_up ?? true,
        remind_minutes: profile?.remind_minutes ?? 10,
      }}
      needsMigration={!profile || !("blocked_sites" in profile)}
    />
  );
}
