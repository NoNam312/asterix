import { renderAppIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

// Icons referenced by the web app manifest (Android / desktop installs).
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return renderAppIcon(size);
}
