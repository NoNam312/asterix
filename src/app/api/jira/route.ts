import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, JiraError, normaliseSite, searchIssues, verify, type JiraConnection } from "@/lib/jira";

async function signedIn() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  return auth.user ? supabase : null;
}

const fail = (err: unknown, status = 422) =>
  NextResponse.json({ error: err instanceof JiraError ? err.message : "Something went wrong with Jira." }, { status });

/** Your open Jira issues, or { connected: false }. The token never leaves the server. */
export async function GET() {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase
    .from("jira_connections")
    .select("site, email, token_cipher, jql, account_name")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ connected: false });
  try {
    const issues = await searchIssues(data as JiraConnection);
    return NextResponse.json({ connected: true, site: data.site, account: data.account_name, jql: data.jql, issues });
  } catch (err) {
    return NextResponse.json({ connected: true, site: data.site, account: data.account_name, jql: data.jql, issues: [], error: err instanceof JiraError ? err.message : "Couldn't load Jira issues." });
  }
}

/** Connects (or reconnects) Jira after checking the email and API token work. */
export async function POST(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { email, token } = body as { email?: unknown; token?: unknown };
  if (typeof body.site !== "string" || typeof email !== "string" || typeof token !== "string" || !email.trim() || !token.trim()) {
    return NextResponse.json({ error: "Fill in your Jira address, email and API token." }, { status: 400 });
  }
  try {
    const site = normaliseSite(body.site);
    const account = await verify(site, email.trim(), token.trim());
    const { error } = await supabase.from("jira_connections").upsert({
      site,
      email: email.trim(),
      token_cipher: encryptToken(token.trim()),
      account_name: account,
    });
    if (error) throw new JiraError(error.message.includes("jira_connections") ? "Run supabase/015_jira.sql first." : error.message);
    return NextResponse.json({ connected: true, site, account });
  } catch (err) {
    return fail(err);
  }
}

/** Changes which issues are shown (a JQL search). */
export async function PATCH(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { jql } = (await request.json().catch(() => ({}))) as { jql?: unknown };
  if (typeof jql !== "string" || !jql.trim() || jql.length > 1000) {
    return NextResponse.json({ error: "Enter a JQL search." }, { status: 400 });
  }
  const { data } = await supabase.from("jira_connections").select("site, email, token_cipher").maybeSingle();
  if (!data) return NextResponse.json({ error: "Connect Jira first." }, { status: 400 });
  try {
    // Try it before saving, so a typo doesn't leave the list broken.
    const issues = await searchIssues({ ...(data as JiraConnection), jql: jql.trim() });
    await supabase.from("jira_connections").update({ jql: jql.trim() }).eq("site", data.site);
    return NextResponse.json({ ok: true, count: issues.length });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE() {
  const supabase = await signedIn();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await supabase.from("jira_connections").delete().not("site", "is", null);
  return NextResponse.json({ connected: false });
}
