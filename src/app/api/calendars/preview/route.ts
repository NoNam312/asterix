import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FeedError, fetchFeed, parseFeed, summariseSeries } from "@/lib/calendar-feed";
import { safeTimeZone } from "@/lib/calendar-sync";

// Reads a feed without saving anything, so the user can choose which classes to keep.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Paste a calendar link first." }, { status: 400 });
  }
  const tz = safeTimeZone(body.tz);

  try {
    const { name, events } = parseFeed(await fetchFeed(body.url), tz);
    if (!events.length) {
      return NextResponse.json({ error: "No upcoming events in this calendar (next 4 months)." }, { status: 422 });
    }
    return NextResponse.json({ name, series: summariseSeries(events, tz) });
  } catch (err) {
    const message = err instanceof FeedError ? err.message : "Couldn't read that calendar.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
