/**
 * A short vibration "tick". Android supports navigator.vibrate; iPhone Safari doesn't, but on
 * iOS 18+ toggling a native switch input produces a haptic tick, so fall back to that.
 */
export function haptic() {
  try {
    if (typeof navigator.vibrate === "function" && navigator.vibrate(15)) return;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.style.display = "none";
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // Haptics are a nice-to-have; ignore failures.
  }
}
