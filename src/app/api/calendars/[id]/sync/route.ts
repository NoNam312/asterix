import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FeedError } from "@/lib/calendar-feed";
import { safeTimeZone, syncCalendar } from "@/lib/calendar-sync";

// Pulls the latest events for one calendar layer into the user's quests.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await syncCalendar(supabase, id, safeTimeZone(body.tz));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof FeedError ? err.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
