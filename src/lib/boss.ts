// Boss quests: an upcoming due date is a boss. Its HP is the work it needs (1 HP per minute);
// study on its subject deals damage; beating it before it's due pays XP (supabase/017_bosses.sql).
import type { DeadlineProgress } from "./urgency.ts";

export type Boss = {
  hp: number;
  /** Damage dealt so far (minutes of completed work). */
  damage: number;
  /** Damage still planned (upcoming quests). */
  incoming: number;
  /** HP left now. */
  left: number;
  /** HP left after everything planned is done; 0 means the plan is enough. */
  leftAfterPlan: number;
  defeated: boolean;
  /** XP for beating it; must match claim_boss_reward. */
  reward: number;
};

/** Must match claim_boss_reward: 50 XP + 10 per hour of HP, at most 300. */
export const bossReward = (hp: number) => Math.min(300, 50 + Math.round((hp / 60) * 10));

export function bossOf(p: DeadlineProgress, claimed: boolean): Boss {
  const hp = Math.max(30, p.deadline.needMinutes);
  const left = Math.max(0, hp - p.doneMinutes);
  return {
    hp,
    damage: Math.min(hp, p.doneMinutes),
    incoming: p.plannedMinutes,
    left,
    leftAfterPlan: Math.max(0, left - p.plannedMinutes),
    defeated: claimed || left === 0,
    reward: bossReward(hp),
  };
}
