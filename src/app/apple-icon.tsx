import { renderAppIcon } from "@/lib/app-icon";

// Home-screen icon for iPhone / iPad.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
