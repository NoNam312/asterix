import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/secret-box";
import { CanvasError, loadCourses, normaliseCanvasUrl, verify } from "@/lib/canvas-api";

async function signedIn() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  return auth.user ? supabase : null;
}

const message = (err: unknown, fallback: string) => (err instanceof CanvasError ? err.message : fallback);

/** Your courses, marks and weightings, or { connected: false }. The token never leaves the server. */
export async function GET() {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase.from("canvas_connections").select("base_url, token_cipher, account_name").maybeSingle();
  if (error) return NextResponse.json({ connected: false, ready: false });
  if (!data) return NextResponse.json({ connected: false, ready: true });
  const info = { connected: true, ready: true, site: data.base_url, account: data.account_name };
  try {
    return NextResponse.json({ ...info, courses: await loadCourses(data.base_url, decryptToken(data.token_cipher)) });
  } catch (err) {
    return NextResponse.json({ ...info, courses: [], error: message(err, "Couldn't load your marks.") });
  }
}

/** Connects Canvas after checking the address and token work. */
export async function POST(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { url?: unknown; token?: unknown };
  if (typeof body.url !== "string" || typeof body.token !== "string" || !body.token.trim()) {
    return NextResponse.json({ error: "Fill in your Canvas address and access token." }, { status: 400 });
  }
  try {
    const base = normaliseCanvasUrl(body.url);
    const account = await verify(base, body.token.trim());
    const { error } = await supabase.from("canvas_connections").upsert({
      base_url: base,
      token_cipher: encryptToken(body.token.trim()),
      account_name: account,
    });
    if (error) throw new CanvasError(error.message.includes("canvas_connections") ? "Run supabase/021_canvas.sql first." : error.message);
    return NextResponse.json({ connected: true, site: base, account });
  } catch (err) {
    return NextResponse.json({ error: message(err, "Couldn't connect Canvas.") }, { status: 422 });
  }
}

export async function DELETE() {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await supabase.from("canvas_connections").delete().not("base_url", "is", null);
  return NextResponse.json({ connected: false });
}
