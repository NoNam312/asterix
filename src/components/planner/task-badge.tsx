import { TASK_APPS, type TaskProvider } from "@/lib/task-apps";

/** A small filled pill in the app's colour: "#12", "ENG-42", or the app's name. */
export function TaskBadge({ provider, label }: { provider: TaskProvider; label?: string | null }) {
  const app = TASK_APPS[provider];
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-semibold leading-4 text-white"
      style={{ background: app.color }}
      title={`From ${app.name}`}
      aria-label={`From ${app.name}`}
    >
      {label || app.name}
    </span>
  );
}
