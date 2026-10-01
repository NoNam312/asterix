import type { Boss } from "@/lib/boss";

/**
 * A boss's health bar: solid red is HP nothing is planned for yet, light red is HP your planned
 * quests will take off, and the empty part is damage already dealt.
 */
export function BossBar({ boss, size = "sm" }: { boss: Boss; size?: "sm" | "lg" }) {
  const height = size === "lg" ? "h-3" : "h-1.5";
  if (boss.defeated) {
    return <div className={`${height} w-full rounded-full bg-xp`} title="Defeated" />;
  }
  const pct = (n: number) => `${(n / boss.hp) * 100}%`;
  const queued = boss.left - boss.leftAfterPlan;
  return (
    <div
      className={`${height} flex w-full overflow-hidden rounded-full bg-line`}
      title={`${boss.left} / ${boss.hp} HP left${queued ? ` · ${queued} HP of damage planned` : ""}`}
    >
      <div className="h-full bg-danger" style={{ width: pct(boss.leftAfterPlan) }} />
      <div className="h-full bg-danger/35" style={{ width: pct(queued) }} />
    </div>
  );
}

/** "240 / 360 HP" */
export function hpLabel(boss: Boss) {
  return boss.defeated ? "Defeated" : `${boss.left} / ${boss.hp} HP`;
}
