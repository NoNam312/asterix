import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

// Sends a test notification to the signed-in user's devices (or just one, if given).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (typeof body.endpoint === "string") query = query.eq("endpoint", body.endpoint);
  const { data: subs } = await query;
  if (!subs?.length) return NextResponse.json({ error: "No devices have notifications turned on." }, { status: 404 });

  let sent = 0;
  for (const sub of subs) {
    const result = await sendPush(sub, {
      title: "🔔 Notifications are on",
      body: "QuestLog will remind you before quests and classes start.",
      tag: "test",
      url: "/",
    });
    if (result === "sent") sent++;
    if (result === "gone") await supabase.from("push_subscriptions").delete().eq("id", sub.id);
  }
  if (!sent) return NextResponse.json({ error: "Couldn't reach this device. Try turning notifications off and on." }, { status: 502 });
  return NextResponse.json({ sent });
}
