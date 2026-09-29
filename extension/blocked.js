import { APP_URL } from "./config.js";
import { isLocked, send } from "./shared.js";

const $ = (id) => document.getElementById(id);

// The original URL is everything after "?u=" (may or may not be encoded).
const raw = location.search.startsWith("?u=") ? location.search.slice(3) : "";
let target = raw;
try {
  target = decodeURIComponent(raw);
} catch {
  // not encoded
}
let host = "";
try {
  host = new URL(target).hostname.replace(/^www\./, "");
} catch {
  target = "";
}

$("open-app").href = APP_URL;
$("title").textContent = host ? `${host} is locked` : "This site is locked";

function render(status) {
  if (!status) {
    $("subtitle").textContent = "Sign in to the QuestLog extension to see your progress.";
    $("progress").classList.add("hidden");
    $("emergency").classList.add("hidden");
    return;
  }

  const locked = isLocked(status);
  $("earned").textContent = status.earned;
  $("goal").textContent = status.goal;
  $("bar").style.width = `${Math.min(100, (status.earned / status.goal) * 100)}%`;
  $("left").textContent = locked
    ? `${status.goal - status.earned} XP to go, or finish your ${status.quests_left} remaining quest${status.quests_left === 1 ? "" : "s"} today.`
    : "Goal reached!";
  $("emergency").textContent = `Emergency unlock: −${status.emergency_cost} XP for ${status.emergency_minutes} min`;
  $("emergency").classList.toggle("hidden", !locked);

  const messaging = status.allowed_urls.filter((a) => host && a.includes(host.split(".").slice(-2).join(".")));
  $("allowed").textContent = messaging.length
    ? `Messages are still open: ${messaging.join(", ")}`
    : "";

  if (!locked) {
    $("icon").textContent = "🔓";
    $("pill").className = "pill unlocked";
    $("pill").textContent = "🔓 Unlocked";
    $("subtitle").textContent =
      status.quests_left === 0 && !status.goal_reached
        ? "No quests left today, so you're free."
        : "Nice work. You've earned your break.";
    if (target) {
      $("continue").href = target;
      $("continue").classList.remove("hidden");
      $("open-app").classList.add("hidden");
    }
  }
}

async function refresh() {
  $("error").classList.add("hidden");
  try {
    render((await send("status")).status);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").classList.remove("hidden");
  }
}

$("refresh").addEventListener("click", refresh);

$("emergency").addEventListener("click", async () => {
  if (!confirm("Spend XP to unlock all sites for a short time?")) return;
  try {
    render((await send("emergency")).status);
    if (target) location.href = target;
  } catch (err) {
    $("error").textContent = err.message;
    $("error").classList.remove("hidden");
  }
});

// Update live when the background worker re-checks XP.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) render(changes.status.newValue ?? null);
});

const { status } = await chrome.storage.local.get("status");
render(status ?? null);
refresh();
