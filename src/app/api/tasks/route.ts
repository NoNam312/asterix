import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/secret-box";
import { PROVIDERS, TaskAppError, type Credentials } from "@/lib/task-apps-server";
import { TASK_PROVIDERS, type ExternalTask, type TaskProvider } from "@/lib/task-apps";

async function signedIn() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  return auth.user ? supabase : null;
}

const isProvider = (p: unknown): p is TaskProvider => typeof p === "string" && (TASK_PROVIDERS as string[]).includes(p);
const message = (err: unknown, fallback: string) => (err instanceof TaskAppError ? err.message : fallback);

/** Tasks from every connected app (tokens never leave the server), plus which apps are connected. */
export async function GET() {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase.from("task_connections").select("provider, token_cipher, account_name");
  if (error) return NextResponse.json({ ready: false, connections: [], tasks: [], errors: {} });

  const connections = (data ?? []) as { provider: TaskProvider; token_cipher: string; account_name: string | null }[];
  const errors: Partial<Record<TaskProvider, string>> = {};
  const lists = await Promise.all(
    connections.map(async (c) => {
      try {
        return await PROVIDERS[c.provider].list(JSON.parse(decryptToken(c.token_cipher)) as Credentials);
      } catch (err) {
        errors[c.provider] = message(err, "Couldn't load tasks.");
        return [] as ExternalTask[];
      }
    }),
  );
  return NextResponse.json({
    ready: true,
    connections: connections.map((c) => ({ provider: c.provider, account: c.account_name })),
    tasks: lists.flat(),
    errors,
  });
}

/** Connects an app after checking its credentials work. */
export async function POST(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { provider?: unknown; token?: unknown; key?: unknown };
  if (!isProvider(body.provider)) return NextResponse.json({ error: "Unknown app." }, { status: 400 });
  if (typeof body.token !== "string" || !body.token.trim()) {
    return NextResponse.json({ error: "Paste the token first." }, { status: 400 });
  }
  const credentials: Credentials = {
    token: body.token.trim(),
    ...(typeof body.key === "string" && body.key.trim() ? { key: body.key.trim() } : {}),
  };
  try {
    const account = await PROVIDERS[body.provider].verify(credentials);
    const { error } = await supabase.from("task_connections").upsert({
      provider: body.provider,
      token_cipher: encryptToken(JSON.stringify(credentials)),
      account_name: account,
    });
    if (error) {
      throw new TaskAppError(error.message.includes("task_connections") ? "Run supabase/020_task_apps.sql first." : error.message);
    }
    return NextResponse.json({ connected: true, account });
  } catch (err) {
    return NextResponse.json({ error: message(err, "Couldn't connect.") }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown app." }, { status: 400 });
  await supabase.from("task_connections").delete().eq("provider", provider);
  return NextResponse.json({ connected: false });
}
