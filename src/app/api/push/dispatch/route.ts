import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { sendPush } from "@/lib/push";
import { formatDuration } from "@/lib/dates";

type Reminder = {
  kind: "starting" | "time_up" | "due";
  quest_id: string;
  title: string;
  start_at: string;
  duration_min: number;
  xp: number;
  difficulty: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string;
};

function message(r: Reminder) {
  const time = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-AU", { timeZone: r.time_zone, ...opts }).format(new Date(r.start_at));
  const tag = `${r.kind}-${r.quest_id}`;
  if (r.kind === "time_up") {
    return { title: `⏰ Time's up: ${r.title}`, body: "Did you finish? Open QuestLog to complete it and claim your XP.", tag };
  }
  if (r.kind === "due") {
    return {
      title: `🚩 Due soon: ${r.title}`,
      body: `Due ${time({ weekday: "short", hour: "numeric", minute: "2-digit" })}. Plan a quest for it today.`,
      tag,
    };
  }
  const rank = r.difficulty ? ` · Rank ${r.difficulty}` : "";
  return {
    title: `⚔️ ${r.title}`,
    body: `Starts ${time({ hour: "numeric", minute: "2-digit" })} · ${formatDuration(r.duration_min)}${rank} · +${r.xp} XP`,
    tag,
  };
}

// Called every minute by the Supabase scheduler (see supabase/008_notifications.sql).
// The secret header is checked inside the database, so this route never needs to know it.
export async function POST(request: Request) {
  const secret = request.headers.get("x-reminder-secret");
  if (!secret) return NextResponse.json({ error: "Missing secret" }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("claim_due_reminders", { p_secret: secret });
  if (error) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  let sent = 0;
  let removed = 0;
  for (const r of (data ?? []) as Reminder[]) {
    const result = await sendPush(r, { ...message(r), url: "/" });
    if (result === "sent") sent++;
    if (result === "gone") {
      await supabase.rpc("forget_push_endpoint", { p_secret: secret, p_endpoint: r.endpoint });
      removed++;
    }
  }
  return NextResponse.json({ sent, removed });
}
