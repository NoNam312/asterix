// Helpers shared by the background worker, popup and blocked page.

/** "https://www.YouTube.com/" -> "youtube.com" (keeps any path, e.g. "instagram.com/direct"). */
export function normalizeSite(site) {
  return String(site)
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Locked unless today's goal is reached or an emergency unlock is running. */
export function isLocked(status) {
  const checkedToday =
    status.checked_at && new Date(status.checked_at).toDateString() === new Date().toDateString();
  const goalReached = checkedToday && status.goal_reached;
  const emergency = status.unlocked_until && new Date(status.unlocked_until).getTime() > Date.now();
  return !goalReached && !emergency;
}

export function isBlockedUrl(url, status) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^www\./, "");

  const blocked = status.blocked_sites.some((s) => hostMatches(host, normalizeSite(s).split("/")[0]));
  if (!blocked) return false;

  const allowed = status.allowed_urls.some((a) => {
    const site = normalizeSite(a);
    const slash = site.indexOf("/");
    const domain = slash === -1 ? site : site.slice(0, slash);
    const path = slash === -1 ? "/" : site.slice(slash);
    return hostMatches(host, domain) && parsed.pathname.startsWith(path);
  });
  return !allowed;
}

/** Sends a message to the background worker and unwraps the reply. */
export async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || "Something went wrong");
  return res;
}
