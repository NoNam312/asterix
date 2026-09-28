import { APP_URL } from "./config.js";
import { isLocked, send } from "./shared.js";

const $ = (id) => document.getElementById(id);

$("open-app").href = APP_URL;

function render({ email, status }) {
  $("login").classList.toggle("hidden", !!status);
  $("status").classList.toggle("hidden", !status);
  $("pill").classList.toggle("hidden", !status);
  if (!status) return;

  const locked = isLocked(status);
  $("pill").className = `pill ${locked ? "locked" : "unlocked"}`;
  $("pill").textContent = locked ? "🔒 Locked" : "🔓 Unlocked";
  $("earned").textContent = status.earned;
  $("goal").textContent = status.goal;
  $("bar").style.width = `${Math.min(100, (status.earned / status.goal) * 100)}%`;
  $("account").textContent = email ?? status.username;

  const until = status.unlocked_until ? new Date(status.unlocked_until) : null;
  if (status.goal_reached) {
    $("message").textContent = "Daily goal reached. All sites are unlocked for today 🎉";
  } else if (until && until > new Date()) {
    $("message").textContent = `Emergency unlock until ${until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  } else {
    $("message").textContent = `Earn ${status.goal - status.earned} more XP to unlock ${status.blocked_sites.length} blocked sites.`;
  }

  $("emergency").classList.toggle("hidden", !locked);
  $("emergency").textContent = `Emergency unlock: −${status.emergency_cost} XP for ${status.emergency_minutes} min`;
}

function showError(id, err) {
  $(id).textContent = err.message;
  $(id).classList.remove("hidden");
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").classList.add("hidden");
  const form = new FormData(e.target);
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    render(await send("login", { email: form.get("email"), password: form.get("password") }));
  } catch (err) {
    showError("login-error", err);
  } finally {
    button.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  await send("logout");
  render({});
});

$("refresh").addEventListener("click", async () => {
  $("status-error").classList.add("hidden");
  try {
    render(await send("status"));
  } catch (err) {
    showError("status-error", err);
  }
});

$("emergency").addEventListener("click", async () => {
  if (!confirm("Spend XP to unlock all sites for a short time?")) return;
  $("status-error").classList.add("hidden");
  try {
    render({ ...(await send("emergency")), email: $("account").textContent });
  } catch (err) {
    showError("status-error", err);
  }
});

// Show the cached status instantly, then refresh.
const { session, status } = await chrome.storage.local.get(["session", "status"]);
render({ email: session?.email, status: session ? status : null });
if (session) $("refresh").click();
