import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTransitions, JiraError, transitionIssue, type JiraConnection } from "@/lib/jira";

async function connection() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data } = await supabase.from("jira_connections").select("site, email, token_cipher, jql").maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Connect Jira in Settings first." }, { status: 400 }) };
  return { conn: data as JiraConnection };
}

const fail = (err: unknown) =>
  NextResponse.json({ error: err instanceof JiraError ? err.message : "Something went wrong with Jira." }, { status: 422 });

/** GET ?key=KAN-40 → the statuses this issue can move to. */
export async function GET(request: Request) {
  const { conn, error } = await connection();
  if (error) return error;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    return NextResponse.json({ transitions: await getTransitions(conn, key) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { key, id } or { key, category: "done" } → moves the issue. */
export async function POST(request: Request) {
  const { conn, error } = await connection();
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; id?: unknown; category?: unknown };
  if (typeof body.key !== "string") return NextResponse.json({ error: "Missing issue." }, { status: 400 });
  const target =
    typeof body.id === "string" ? { id: body.id } : typeof body.category === "string" ? { category: body.category } : null;
  if (!target) return NextResponse.json({ error: "Missing status." }, { status: 400 });
  try {
    await transitionIssue(conn, body.key, target);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
