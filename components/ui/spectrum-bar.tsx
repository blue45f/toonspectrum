import { cn } from "@/lib/utils";
import { spectrumGradient, genreColor } from "@/lib/genre-color";

// 장르 믹스 스펙트럼 — 작품의 장르들을 가로 그라디언트로
export function GenreSpectrum({
  genres,
  className,
  height = 4,
}: {
  genres: string[];
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={cn("w-full rounded-full overflow-hidden", className)}
      style={{ height, background: spectrumGradient(genres) }}
      aria-hidden
    />
  );
}

// 평점 분포 바 (1~5점 누적) — 스펙트럼 톤
export function DistributionBars({
  dist,
  className,
}: {
  dist: [number, number, number, number, number];
  className?: string;
}) {
  const total = dist.reduce((a, b) => a + b, 0) || 1;
  const rows = [5, 4, 3, 2, 1];
  // 5점=따뜻한 악센트 계열 → 1점=차가운 회색, 점수별 hue
  const hue = (s: number) => {
    const map: Record<number, string> = {
      5: "oklch(0.72 0.185 42)",
      4: "oklch(0.74 0.13 60)",
      3: "oklch(0.72 0.07 90)",
      2: "oklch(0.62 0.04 80)",
      1: "oklch(0.5 0.03 70)",
    };
    return map[s];
  };
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((s) => {
        const v = dist[s - 1];
        const pct = (v / total) * 100;
        return (
          <div key={s} className="flex items-center gap-2.5">
            <span className="numeral w-3 text-right text-xs text-fg-3">{s}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-raised">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: hue(s) }}
              />
            </div>
            <span className="tnum w-10 text-right text-[0.7rem] text-fg-3">
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 단일 미터 (트렌드/완독률/몰입지수). 라벨 + 값.
export function MeterBar({
  value,
  max = 100,
  label,
  color = "var(--color-accent)",
  className,
  suffix = "",
}: {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  className?: string;
  suffix?: string;
}) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-fg-2">{label}</span>
          <span className="numeral text-xs text-fg">
            {value}
            {suffix}
          </span>
        </div>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out-expo"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// 장르 도트 (범례용)
export function GenreDot({ genre, className }: { genre: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", className)}
      style={{ backgroundColor: genreColor(genre, 0.7) }}
    />
  );
}
