import { renderAppIcon } from "@/lib/app-icon";

const SIZES = new Set([16, 32, 48, 128, 192, 512]);

// Icons for the web app manifest (192, 512) and the Chrome extension (16–128).
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return renderAppIcon(size);
}
