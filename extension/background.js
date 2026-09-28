// QuestLog Focus Lock: background service worker.
// Signs in to Supabase, checks today's XP every minute, and blocks distracting
// sites (via declarativeNetRequest + tab URL checks) until the daily goal is reached.

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { isBlockedUrl, isLocked, normalizeSite } from "./shared.js";

const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");

// ---------- auth ----------

class AuthError extends Error {}

let refreshing = null; // single in-flight token refresh (refresh tokens are single-use)

async function tokenRequest(grantType, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.error_description || json.msg || json.message || "Sign-in failed";
    throw res.status === 400 || res.status === 401 ? new AuthError(message) : new Error(message);
  }
  const session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    email: json.user?.email,
  };
  await chrome.storage.local.set({ session });
  return session;
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return null;
  if (session.expires_at * 1000 - Date.now() > 60_000) return session;

  refreshing ??= tokenRequest("refresh_token", { refresh_token: session.refresh_token }).finally(
    () => (refreshing = null),
  );
  try {
    return await refreshing;
  } catch (err) {
    if (err instanceof AuthError) {
      await chrome.storage.local.remove(["session", "status"]);
      return null;
    }
    throw err; // offline: keep the session and try again later
  }
}

async function rpc(name, args = {}) {
  const session = await getSession();
  if (!session) throw new AuthError("Not signed in");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) throw new AuthError("Session expired");
  if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);
  return json;
}

// ---------- status + blocking ----------

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { p_start: start.toISOString(), p_end: end.toISOString() };
}

async function refreshStatus() {
  let status;
  try {
    status = { ...(await rpc("get_focus_status", todayRange())), checked_at: Date.now() };
    await chrome.storage.local.set({ status });
  } catch (err) {
    if (err instanceof AuthError) {
      await chrome.storage.local.remove("status");
      await applyRules(null);
      return null;
    }
    // Offline or server error: keep enforcing the last known status.
    ({ status } = await chrome.storage.local.get("status"));
    if (!status) return null;
  }
  await applyRules(status);
  return status;
}

async function applyRules(status) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  const locked = status && isLocked(status);

  if (locked) {
    let id = 1;
    for (const allowed of status.allowed_urls) {
      const site = normalizeSite(allowed);
      if (!site) continue;
      addRules.push({
        id: id++,
        priority: 2,
        action: { type: "allow" },
        condition: { urlFilter: `||${site}`, resourceTypes: ["main_frame"] },
      });
    }
    const domains = status.blocked_sites.map((s) => normalizeSite(s).split("/")[0]).filter(Boolean);
    if (domains.length) {
      addRules.push({
        id: id++,
        priority: 1,
        action: { type: "redirect", redirect: { regexSubstitution: `${BLOCKED_PAGE}?u=\\0` } },
        condition: { regexFilter: "^.*$", requestDomains: domains, resourceTypes: ["main_frame"] },
      });
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  if (locked) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) lockTabIfNeeded(tab.id, tab.url, status);
  }
  updateBadge(status);
  scheduleRelock(status);
}

function lockTabIfNeeded(tabId, url, status) {
  if (!url || !isBlockedUrl(url, status)) return;
  chrome.tabs.update(tabId, { url: `${BLOCKED_PAGE}?u=${encodeURIComponent(url)}` });
}

function updateBadge(status) {
  if (!status) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (isLocked(status)) {
    const left = Math.max(0, status.goal - status.earned);
    chrome.action.setBadgeText({ text: left > 999 ? "999+" : String(left) });
    chrome.action.setBadgeBackgroundColor({ color: "#3b6fd8" });
  } else {
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#0f9f8f" });
  }
}

/** Re-check right when an emergency unlock runs out. */
function scheduleRelock(status) {
  const until = status?.unlocked_until ? new Date(status.unlocked_until).getTime() : 0;
  if (until > Date.now()) chrome.alarms.create("relock", { when: until + 1000 });
}

// ---------- events ----------

function setup() {
  chrome.alarms.create("refresh", { periodInMinutes: 1 });
  refreshStatus();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener(() => refreshStatus());

// Catches in-page navigation (e.g. leaving Instagram DMs for the feed), which
// doesn't trigger a new page request.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || changeInfo.url.startsWith(BLOCKED_PAGE)) return;
  const { status } = await chrome.storage.local.get("status");
  if (status && isLocked(status)) lockTabIfNeeded(tabId, changeInfo.url, status);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // respond asynchronously
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "login": {
      const session = await tokenRequest("password", { email: msg.email, password: msg.password });
      return { email: session.email, status: await refreshStatus() };
    }
    case "logout": {
      await chrome.storage.local.remove(["session", "status"]);
      await applyRules(null);
      return {};
    }
    case "status": {
      const { session } = await chrome.storage.local.get("session");
      return { email: session?.email, status: await refreshStatus() };
    }
    case "emergency": {
      await rpc("emergency_unlock");
      return { status: await refreshStatus() };
    }
    default:
      throw new Error(`Unknown message: ${msg.type}`);
  }
}
