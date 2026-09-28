/**
 * Level curve: each level needs 250 more XP than the last.
 * Lv2 = 250, Lv3 = 750, Lv4 = 1500, Lv5 = 2500, ...
 */
export function xpForLevel(level: number) {
  return 125 * level * (level - 1);
}

export function levelInfo(totalXp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    intoLevel: totalXp - floor,
    levelSize: next - floor,
    progress: (totalXp - floor) / (next - floor),
  };
}
