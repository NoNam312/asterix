import { RANK_STYLES, type Rank } from "@/lib/difficulty";

export function RankBadge({ rank, size = "sm" }: { rank: Rank; size?: "sm" | "lg" }) {
  const style = RANK_STYLES[rank];
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded font-bold ${
        size === "lg" ? "size-9 text-lg" : "size-4 text-[10px]"
      }`}
      style={{ background: style.soft, color: style.color }}
      title={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}
