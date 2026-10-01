import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/secret-box";
import { PROVIDERS, TaskAppError, type Credentials } from "@/lib/task-apps-server";
import { TASK_PROVIDERS, type TaskProvider } from "@/lib/task-apps";

/** POST { provider, id } → marks that task done in its app. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { provider?: unknown; id?: unknown };
  const provider = body.provider as TaskProvider;
  if (!(TASK_PROVIDERS as unknown[]).includes(provider) || typeof body.id !== "string" || !body.id || body.id.length > 200) {
    return NextResponse.json({ error: "Missing task." }, { status: 400 });
  }
  const { data } = await supabase.from("task_connections").select("token_cipher").eq("provider", provider).maybeSingle();
  if (!data) return NextResponse.json({ error: "That app isn't connected." }, { status: 400 });
  try {
    await PROVIDERS[provider].complete(JSON.parse(decryptToken(data.token_cipher)) as Credentials, body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof TaskAppError ? err.message : "Couldn't update the task." }, { status: 422 });
  }
}
