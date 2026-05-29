import type { Availability } from "@/lib/types";
import { PLATFORMS, PRICING_LABEL, PRICING_FULL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

const PRICING_TONE: Record<string, string> = {
  free: "text-good",
  "wait-free": "text-cool",
  paid: "text-fg-2",
  subscription: "text-warn",
};

// 컴팩트 — 플랫폼 브랜드 도트 (카드용)
export function AvailabilityDots({
  availability,
  className,
  max = 4,
}: {
  availability: Availability[];
  className?: string;
  max?: number;
}) {
  const shown = availability.slice(0, max);
  const rest = availability.length - shown.length;
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label="연재 플랫폼">
      {shown.map((a) => {
        const p = PLATFORMS[a.platformId];
        return (
          <span
            key={a.platformId}
            title={`${p.name} · ${PRICING_FULL[a.pricing]}`}
            className="size-2.5 rounded-full ring-1 ring-black/20"
            style={{ backgroundColor: p.color }}
          />
        );
      })}
      {rest > 0 && <span className="text-[0.65rem] text-fg-3 tnum">+{rest}</span>}
    </span>
  );
}

// 플랫폼 회사명 태그 (브랜드 컬러 도트 + 이름) — 목록용
export function PlatformTags({
  availability,
  max = 2,
  className,
}: {
  availability: Availability[];
  max?: number;
  className?: string;
}) {
  const shown = availability.slice(0, max);
  const rest = availability.length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((a) => {
        const p = PLATFORMS[a.platformId];
        return (
          <span
            key={a.platformId}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.68rem] font-medium leading-none"
            style={{
              color: p.color,
              borderColor: `color-mix(in srgb, ${p.color} 38%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${p.color} 12%, transparent)`,
            }}
            title={`${p.name} · ${PRICING_FULL[a.pricing]}`}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.short}
          </span>
        );
      })}
      {rest > 0 && <span className="text-[0.65rem] text-fg-3 tnum">+{rest}</span>}
    </span>
  );
}

// 풀 라우터 — "어디서 봐" 신호판 (상세 페이지)
export function AvailabilityRouter({
  availability,
  className,
}: {
  availability: Availability[];
  className?: string;
}) {
  // 무료/기다무 우선 정렬
  const order: Record<string, number> = { free: 0, "wait-free": 1, subscription: 2, paid: 3 };
  const sorted = [...availability].sort((a, b) => order[a.pricing] - order[b.pricing]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {sorted.map((a) => {
        const p = PLATFORMS[a.platformId];
        return (
          <a
            key={a.platformId}
            href={a.url ?? "#"}
            target={a.url ? "_blank" : undefined}
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 transition-colors duration-150 hover:border-line-strong hover:bg-raised"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold"
              style={{ backgroundColor: p.color, color: pickText(p.color) }}
            >
              {p.short.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
              <span className={cn("text-xs font-medium", PRICING_TONE[a.pricing])}>
                {PRICING_FULL[a.pricing]}
                {a.isOriginal && <span className="ml-1.5 text-accent">· 독점</span>}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs text-fg-3 transition-colors group-hover:text-fg">
              보러가기
              <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </a>
        );
      })}
    </div>
  );
}

// 가격 요약 한 줄 (최저 진입 비용)
export function bestPricing(availability: Availability[]): { label: string; tone: string } {
  const order: Record<string, number> = { free: 0, "wait-free": 1, subscription: 2, paid: 3 };
  const best = [...availability].sort((a, b) => order[a.pricing] - order[b.pricing])[0];
  if (!best) return { label: "정보 없음", tone: "text-fg-3" };
  return { label: PRICING_LABEL[best.pricing], tone: PRICING_TONE[best.pricing] };
}

// 배경색 대비 텍스트 색 (간이)
function pickText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#000";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1207" : "#fff";
}
