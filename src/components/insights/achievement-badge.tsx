import {
  CalendarCheck,
  Clock,
  Crown,
  Dumbbell,
  Flame,
  Gem,
  Moon,
  Snowflake,
  Sparkles,
  Star,
  Sunrise,
  Swords,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { RANK_STYLES } from "@/lib/difficulty";
import type { Achievement, AchievementGroup } from "@/lib/achievements";

const GROUP_ICONS: Record<AchievementGroup, LucideIcon> = {
  streak: Flame,
  goal: Target,
  quests: Swords,
  rank: Crown,
  hours: Clock,
  level: Star,
  special: Sparkles,
};

const ICONS: Record<string, LucideIcon> = {
  "early-bird": Sunrise,
  "night-owl": Moon,
  marathon: Timer,
  "gym-10": Dumbbell,
  flawless: Gem,
  weekend: CalendarCheck,
  freeze: Snowflake,
};

/** Round badge in the achievement's tier colour (grey while locked). */
export function BadgeIcon({ achievement, size = 40 }: { achievement: Achievement; size?: number }) {
  const Icon = ICONS[achievement.id] ?? GROUP_ICONS[achievement.group];
  const style = RANK_STYLES[achievement.tier];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: achievement.unlocked ? style.soft : "var(--color-surface)",
        color: achievement.unlocked ? style.color : "var(--color-faint)",
        boxShadow: achievement.unlocked ? `inset 0 0 0 2px ${style.color}` : undefined,
      }}
    >
      <Icon size={size * 0.45} />
    </span>
  );
}

export function AchievementCard({ achievement: a, isNew }: { achievement: Achievement; isNew?: boolean }) {
  const { value, target } = a.progress;
  return (
    <li
      className={`relative flex items-center gap-3 rounded-lg border p-3 ${
        a.unlocked ? "border-line bg-canvas" : "border-dashed border-line bg-surface/40"
      }`}
    >
      <BadgeIcon achievement={a} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${a.unlocked ? "" : "text-muted"}`}>{a.title}</p>
        <p className="truncate text-xs text-muted">{a.description}</p>
        {a.unlocked ? (
          <p className="mt-0.5 text-[11px] text-faint">
            {a.unlockedAt
              ? `Earned ${a.unlockedAt.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
              : "Earned"}
          </p>
        ) : (
          target > 1 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(value / target) * 100}%` }} />
              </span>
              <span className="text-[10px] tabular-nums text-faint">
                {value}/{target}
              </span>
            </div>
          )
        )}
      </div>
      {isNew && (
        <span className="absolute right-2 top-2 rounded bg-gold-soft px-1.5 text-[10px] font-semibold text-gold">New</span>
      )}
    </li>
  );
}
