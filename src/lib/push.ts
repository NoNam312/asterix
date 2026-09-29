// Server-only: sends Web Push notifications (works for iPhone home-screen apps, Android, desktop).
import "server-only";
import webpush from "web-push";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Push notification keys are not configured.");
  // The contact push services can reach about this sender.
  webpush.setVapidDetails("https://questlog-lake.vercel.app", publicKey, privateKey);
  configured = true;
}

/** "gone" means the device unsubscribed; its subscription should be deleted. */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<"sent" | "gone" | "failed"> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      { TTL: 15 * 60, urgency: "high" },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
