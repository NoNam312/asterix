import { getLockStatus } from "@/lib/lock-status";

// Plain-text answer for iPhone Shortcuts: "LOCKED" or "OPEN".
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tz = new URL(request.url).searchParams.get("tz") ?? "UTC";
  const status = await getLockStatus(token, tz);
  if (!status) return new Response("UNKNOWN", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(status.unlocked ? "OPEN" : "LOCKED", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
