import type { CSSProperties } from "react";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BookOpenCheck,
  Clapperboard,
  Flame,
  Flower2,
  HeartCrack,
  Moon,
  Swords,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type MarkSize = "dot" | "xs" | "sm" | "md" | "lg";

const platformSizes: Record<MarkSize, string> = {
  dot: "size-3 rounded-[0.25rem]",
  xs: "size-4 rounded-[0.3rem]",
  sm: "size-5 rounded-md",
  md: "size-8 rounded-lg",
  lg: "size-9 rounded-xl",
};

const platformText: Record<MarkSize, string> = {
  dot: "text-[0]",
  xs: "text-[0.48rem]",
  sm: "text-[0.58rem]",
  md: "text-[0.72rem]",
  lg: "text-[0.82rem]",
};

type PlatformPattern =
  | "webtoon"
  | "series"
  | "page"
  | "k-webtoon"
  | "book"
  | "munpia"
  | "joara"
  | "novelpia"
  | "lezhin"
  | "bomtoon"
  | "toptoon"
  | "postype"
  | "mrblue"
  | "comico"
  | "toomics"
  | "bookcube"
  | "onestory"
  | "kyobo"
  | "yes24";

const PLATFORM_MARKS: Record<
  Platform["id"],
  {
    glyph: string;
    pattern: PlatformPattern;
    bg?: string;
    fg?: string;
    plate?: string;
    plateText?: string;
  }
> = {
  "naver-webtoon": {
    glyph: "W",
    pattern: "webtoon",
    bg: "#00DC64",
    fg: "#10130F",
    plate: "#10130F",
    plateText: "#00DC64",
  },
  "naver-series": {
    glyph: "S",
    pattern: "series",
    bg: "#00DC64",
    fg: "#10130F",
    plate: "#10130F",
    plateText: "#00DC64",
  },
  "kakao-page": {
    glyph: "P",
    pattern: "page",
    bg: "#FFCD00",
    fg: "#191600",
    plate: "#191600",
    plateText: "#FFCD00",
  },
  "kakao-webtoon": {
    glyph: "K",
    pattern: "k-webtoon",
    bg: "#18140F",
    fg: "#FFCD00",
    plate: "#FFCD00",
    plateText: "#18140F",
  },
  ridi: { glyph: "R", pattern: "book", bg: "#1F8CE6", fg: "#F4FBFF" },
  munpia: { glyph: "M", pattern: "munpia", bg: "#2B59C3", fg: "#F3F6FF" },
  joara: { glyph: "J", pattern: "joara", bg: "#22B8A6", fg: "#071C19" },
  novelpia: { glyph: "N", pattern: "novelpia", bg: "#7C5CFC", fg: "#FBFAFF" },
  lezhin: { glyph: "L", pattern: "lezhin", bg: "#E11D2E", fg: "#FFF5F6" },
  bomtoon: { glyph: "B", pattern: "bomtoon", bg: "#FF6B9D", fg: "#261018" },
  toptoon: { glyph: "T", pattern: "toptoon", bg: "#FF5A36", fg: "#251009" },
  postype: { glyph: "P", pattern: "postype", bg: "#1A1A1A", fg: "#F7F2EA" },
  mrblue: { glyph: "B", pattern: "mrblue", bg: "#2F6BFF", fg: "#F4F7FF" },
  comico: { glyph: "C", pattern: "comico", bg: "#E93423", fg: "#FFF5F2" },
  toomics: { glyph: "T", pattern: "toomics", bg: "#E60012", fg: "#FFF5F6" },
  bookcube: { glyph: "B", pattern: "bookcube", bg: "#2E7DD7", fg: "#F4FAFF" },
  onestory: { glyph: "1", pattern: "onestory", bg: "#F04E45", fg: "#FFF7F6" },
  kyobo: { glyph: "K", pattern: "kyobo", bg: "#4F7C2F", fg: "#F8FFF1" },
  yes24: { glyph: "24", pattern: "yes24", bg: "#2B56A3", fg: "#F5F8FF" },
};

function luminance(hex: string) {
  const value = hex.replace("#", "");
  if (value.length < 6) return 0.5;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function markStyle(extra?: CSSProperties): CSSProperties {
  return { ...extra };
}

function PlatformSymbol({
  platform,
  size,
}: {
  platform: Pick<Platform, "id" | "short">;
  size: MarkSize;
}) {
  const mark = PLATFORM_MARKS[platform.id] ?? { glyph: platform.short.slice(0, 1), pattern: "book" as const };
  const detailed = size === "sm" || size === "md" || size === "lg";

  if (size === "dot") {
    return (
      <span
        className="relative size-1.5 rounded-[0.2rem]"
        style={markStyle({ backgroundColor: "var(--mark-fg)" })}
      />
    );
  }

  if (size === "xs") {
    return (
      <span className="relative font-display font-bold leading-none" style={markStyle({ color: "var(--mark-fg)" })}>
        {mark.glyph}
      </span>
    );
  }

  switch (mark.pattern) {
    case "webtoon":
      return (
        <span className="relative grid h-[58%] w-[74%] place-items-center rounded-[0.28rem] bg-[var(--mark-plate)]">
          <span className="absolute -bottom-[18%] left-[18%] h-[28%] w-[24%] rotate-[-28deg] rounded-[0.08rem] bg-[var(--mark-plate)]" />
          <span
            className="relative font-display font-black leading-none"
            style={markStyle({ color: "var(--mark-plate-text)", fontSize: detailed ? "0.38em" : "0.68em" })}
          >
            {detailed ? "WEBTOON" : "W"}
          </span>
        </span>
      );
    case "series":
      return (
        <span className="relative grid h-[58%] w-[76%] place-items-center rounded-[0.22rem] bg-[var(--mark-plate)]">
          <span
            className="relative font-display font-black leading-none"
            style={markStyle({ color: "var(--mark-plate-text)", fontSize: detailed ? "0.42em" : "0.72em" })}
          >
            {detailed ? "series" : "S"}
          </span>
        </span>
      );
    case "page":
      return (
        <span className="relative grid h-[70%] w-[64%] place-items-center rounded-[0.26rem] bg-[var(--mark-plate)]">
          <span className="font-display text-[0.9em] font-black leading-none text-[var(--mark-plate-text)]">P</span>
          <span className="absolute right-0 top-0 h-[30%] w-[34%] rounded-bl-[0.18rem] bg-[var(--mark-fold)]" />
        </span>
      );
    case "k-webtoon":
      return (
        <span className="relative grid h-[70%] w-[76%] place-items-center rounded-[0.2rem]">
          <span
            className="font-display font-black leading-none"
            style={markStyle({ color: "var(--mark-fg)", fontSize: detailed ? "0.44em" : "0.82em" })}
          >
            {detailed ? "KAKAO" : "K"}
          </span>
          {detailed ? (
            <span className="absolute bottom-[12%] font-display text-[0.22em] font-bold tracking-[0.08em] text-[var(--mark-fg)]">
              WEBTOON
            </span>
          ) : null}
          <span className="absolute right-[4%] top-[16%] h-[64%] w-[16%] rotate-45 rounded-full bg-[var(--mark-fg)] opacity-75" />
        </span>
      );
    case "book":
      return (
        <span className="relative flex h-[62%] w-[68%] items-stretch justify-center gap-[2px]">
          <span className="w-[42%] rounded-l-md border-2 border-[var(--mark-fg)] border-r-0" />
          <span className="w-[42%] rounded-r-md border-2 border-[var(--mark-fg)] border-l-0" />
          <span className="absolute bottom-[18%] h-px w-[62%] bg-[var(--mark-fg)] opacity-65" />
        </span>
      );
    case "munpia":
      return (
        <span className="relative h-[66%] w-[70%]">
          <span className="absolute bottom-0 left-0 h-full w-[18%] rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute bottom-0 right-0 h-full w-[18%] rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute left-[20%] top-[5%] h-[72%] w-[18%] rotate-[-24deg] rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute right-[20%] top-[5%] h-[72%] w-[18%] rotate-[24deg] rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "joara":
      return (
        <span className="relative h-[68%] w-[60%] rounded-[50%_50%_48%_18%] bg-[var(--mark-fg)]">
          <span className="absolute bottom-[16%] left-[35%] h-[58%] w-[18%] rounded-full bg-[var(--mark-bg-text)] opacity-72" />
          <span className="absolute -right-[16%] bottom-[8%] size-[28%] rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "novelpia":
      return (
        <span className="relative font-display text-[0.98em] font-black leading-none text-[var(--mark-fg)]">
          N
          <span className="absolute -right-[34%] -top-[24%] size-1.5 rotate-45 rounded-[1px] bg-[var(--mark-fg)]" />
        </span>
      );
    case "lezhin":
      return (
        <span className="relative h-[66%] w-[56%]">
          <span className="absolute bottom-0 left-0 h-full w-[24%] rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute bottom-0 left-0 h-[24%] w-full rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute right-0 top-0 h-[24%] w-[58%] rounded-full bg-[var(--mark-fg)] opacity-[0.6]" />
        </span>
      );
    case "bomtoon":
      return (
        <span className="relative grid h-[68%] w-[68%] place-items-center rounded-full border-2 border-[var(--mark-fg)] font-display text-[0.68em] font-black leading-none text-[var(--mark-fg)]">
          B
          <span className="absolute -right-[8%] top-[8%] size-[26%] rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "toptoon":
      return (
        <span className="relative h-[66%] w-[70%]">
          <span className="absolute left-0 top-0 h-[22%] w-full rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute left-[39%] top-0 h-full w-[22%] rounded-full bg-[var(--mark-fg)]" />
          <span className="absolute bottom-0 right-0 h-[22%] w-[44%] rounded-full bg-[var(--mark-fg)] opacity-75" />
        </span>
      );
    case "postype":
      return (
        <span className="relative grid h-[68%] w-[64%] place-items-center rounded-md border-2 border-[var(--mark-fg)] font-display text-[0.72em] font-black leading-none text-[var(--mark-fg)]">
          P
          <span className="absolute bottom-[12%] right-[8%] h-[14%] w-[48%] -rotate-45 rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "mrblue":
      return (
        <span className="relative grid h-[68%] w-[68%] place-items-center rounded-full border-2 border-[var(--mark-fg)] font-display text-[0.68em] font-black leading-none text-[var(--mark-fg)]">
          B
          <span className="absolute bottom-[12%] h-[18%] w-[70%] rounded-full bg-[var(--mark-fg)] opacity-65" />
        </span>
      );
    case "comico":
      return (
        <span className="relative h-[68%] w-[68%] rounded-full border-[3px] border-[var(--mark-fg)] border-r-transparent">
          <span className="absolute right-[4%] top-[38%] h-[22%] w-[34%] rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "toomics":
      return (
        <span className="relative grid h-[70%] w-[68%] place-items-center font-display text-[0.9em] font-black leading-none text-[var(--mark-fg)]">
          T
          <span className="absolute bottom-[2%] h-[18%] w-[76%] rounded-full bg-[var(--mark-fg)] opacity-72" />
        </span>
      );
    case "bookcube":
      return (
        <span className="grid h-[62%] w-[62%] grid-cols-2 gap-[2px]">
          <span className="rounded-[0.18rem] bg-[var(--mark-fg)]" />
          <span className="rounded-[0.18rem] bg-[var(--mark-fg)] opacity-75" />
          <span className="rounded-[0.18rem] bg-[var(--mark-fg)] opacity-75" />
          <span className="rounded-[0.18rem] border-2 border-[var(--mark-fg)]" />
        </span>
      );
    case "onestory":
      return (
        <span className="relative grid h-[68%] w-[68%] place-items-center rounded-full border-2 border-[var(--mark-fg)] font-display text-[0.62em] font-black text-[var(--mark-fg)]">
          1
          <span className="absolute -right-[8%] bottom-[8%] h-[30%] w-[28%] rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    case "kyobo":
      return (
        <span className="relative grid h-[68%] w-[68%] place-items-center font-display text-[0.86em] font-black leading-none text-[var(--mark-fg)]">
          K
          <span className="absolute right-0 top-[8%] h-[34%] w-[44%] rounded-full bg-[var(--mark-fg)] opacity-65" />
        </span>
      );
    case "yes24":
      return (
        <span className="relative font-display text-[0.72em] font-black leading-none text-[var(--mark-fg)]">
          24
          <span className="absolute -left-[18%] -top-[18%] size-1 rounded-full bg-[var(--mark-fg)]" />
        </span>
      );
    default:
      return <span className="relative font-display font-bold text-[var(--mark-fg)]">{mark.glyph}</span>;
  }
}

export function PlatformMark({
  platform,
  size = "md",
  className,
  title,
}: {
  platform: Pick<Platform, "id" | "name" | "short" | "color">;
  size?: MarkSize;
  className?: string;
  title?: string;
}) {
  const mark = PLATFORM_MARKS[platform.id];
  const baseColor = mark?.bg ?? platform.color;
  const textColor = mark?.fg ?? (luminance(baseColor) > 0.63 ? "oklch(0.18 0.018 66)" : "oklch(0.96 0.01 85)");
  const bgTextColor = luminance(baseColor) > 0.63 ? "oklch(0.96 0.01 85)" : "oklch(0.18 0.018 66)";
  const plateColor = mark?.plate ?? textColor;
  const plateTextColor = mark?.plateText ?? bgTextColor;

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden border border-[oklch(0.95_0.01_85/0.16)] font-display font-bold leading-none shadow-[inset_0_1px_0_oklch(1_0_0/0.14)]",
        platformSizes[size],
        platformText[size],
        className
      )}
      style={{
        background: `linear-gradient(145deg, color-mix(in oklch, ${baseColor} 96%, oklch(0.95 0.01 85)), color-mix(in oklch, ${baseColor} 78%, oklch(0.14 0.01 70)))`,
        color: textColor,
        "--mark-fg": textColor,
        "--mark-bg-text": bgTextColor,
        "--mark-plate": plateColor,
        "--mark-plate-text": plateTextColor,
        "--mark-fold": `color-mix(in oklch, ${baseColor} 52%, oklch(0.95 0.01 85))`,
      } as CSSProperties}
      title={title ?? platform.name}
      aria-hidden
    >
      <span
        className="absolute inset-x-0 top-0 h-1/2 opacity-45"
        style={{ background: "linear-gradient(to bottom, oklch(0.98 0.01 85 / 0.32), transparent)" }}
      />
      <PlatformSymbol platform={platform} size={size} />
    </span>
  );
}

export function ToonSpectrumMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.65rem] border border-[oklch(0.95_0.01_85/0.14)] bg-[#1c1613] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]",
        className
      )}
      aria-hidden
    >
      <svg className="relative size-full" viewBox="0 0 32 32" fill="none" focusable="false">
        {/* 머리 위 스펙트럼 안테나/방울들 */}
        <circle cx="16" cy="4.5" r="2.2" fill="#ff5e62" /> {/* 빨강 */}
        <circle cx="11" cy="6" r="1.8" fill="#ff9966" />   {/* 주황 */}
        <circle cx="21" cy="6" r="1.8" fill="#ffd15c" />   {/* 노랑 */}
        <circle cx="7" cy="9.5" r="1.4" fill="#4fe090" />   {/* 초록 */}
        <circle cx="25" cy="9.5" r="1.4" fill="#4ca3f5" />  {/* 파랑 */}

        {/* 말풍선 꼬리 */}
        <path d="M 12 25 L 7 28.5 L 9 23 Z" fill="#ffffff" stroke="#251c17" strokeWidth="1.8" strokeLinejoin="round" />

        {/* 귀여운 말풍선 몸통 */}
        <rect x="6" y="8" width="20" height="17" rx="5.5" ry="5.5" fill="#ffffff" stroke="#251c17" strokeWidth="1.8" />
        
        {/* 볼터치 */}
        <ellipse cx="9.5" cy="18.5" rx="2.2" ry="1.3" fill="#ffaab3" />
        <ellipse cx="22.5" cy="18.5" rx="2.2" ry="1.3" fill="#ffaab3" />

        {/* 똘망똘망한 눈 */}
        {/* 왼쪽 눈 */}
        <circle cx="12.2" cy="16" r="1.6" fill="#251c17" />
        <circle cx="11.7" cy="15.5" r="0.5" fill="#ffffff" />
        {/* 오른쪽 눈 */}
        <circle cx="19.8" cy="16" r="1.6" fill="#251c17" />
        <circle cx="19.3" cy="15.5" r="0.5" fill="#ffffff" />

        {/* 귀여운 웃는 입 */}
        <path d="M 14.5 18 Q 16 19.5 17.5 18" stroke="#251c17" strokeWidth="1.2" strokeLinecap="round" fill="none" />

        {/* 반짝이 노란 별 */}
        <path d="M 23.5 11 L 24 12.3 L 25.3 12.8 L 24 13.3 L 23.5 14.6 L 23 13.3 L 21.7 12.8 L 23 12.3 Z" fill="#ffd15c" />
      </svg>
    </span>
  );
}

export const COLLECTION_ICON_OPTIONS: {
  value: string;
  label: string;
  icon: LucideIcon;
  gradient: string;
}[] = [
  {
    value: "\u{1F4DA}",
    label: "읽을거리",
    icon: BookOpenCheck,
    gradient: "linear-gradient(145deg, oklch(0.72 0.185 42), oklch(0.38 0.08 55))",
  },
  {
    value: "\u{1F37F}",
    label: "영상화",
    icon: Clapperboard,
    gradient: "linear-gradient(145deg, oklch(0.8 0.15 80), oklch(0.42 0.08 70))",
  },
  {
    value: "\u{1F525}",
    label: "화제작",
    icon: Flame,
    gradient: "linear-gradient(145deg, oklch(0.74 0.18 32), oklch(0.36 0.09 28))",
  },
  {
    value: "\u{1F494}",
    label: "여운",
    icon: HeartCrack,
    gradient: "linear-gradient(145deg, oklch(0.68 0.16 15), oklch(0.34 0.08 24))",
  },
  {
    value: "\u{1F319}",
    label: "심야",
    icon: Moon,
    gradient: "linear-gradient(145deg, oklch(0.8 0.11 232), oklch(0.3 0.06 240))",
  },
  {
    value: "\u2694\uFE0F",
    label: "전투",
    icon: Swords,
    gradient: "linear-gradient(145deg, oklch(0.7 0.14 285), oklch(0.3 0.06 285))",
  },
  {
    value: "\u{1F338}",
    label: "로맨스",
    icon: Flower2,
    gradient: "linear-gradient(145deg, oklch(0.78 0.15 345), oklch(0.38 0.08 350))",
  },
  {
    value: "\u{1F3C6}",
    label: "명작",
    icon: Trophy,
    gradient: "linear-gradient(145deg, oklch(0.82 0.15 80), oklch(0.42 0.08 78))",
  },
];

export function getCollectionIconOption(value: string) {
  return COLLECTION_ICON_OPTIONS.find((option) => option.value === value) ?? COLLECTION_ICON_OPTIONS[0];
}

export function CollectionIcon({
  value,
  size = "md",
  active,
  className,
}: {
  value: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
}) {
  const option = getCollectionIconOption(value);
  const Icon = option.icon;
  const sizeClass = size === "sm" ? "size-7 rounded-lg" : size === "lg" ? "size-11 rounded-2xl" : "size-9 rounded-xl";
  const iconSize = size === "sm" ? 14 : size === "lg" ? 21 : 17;

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden border border-[oklch(0.95_0.01_85/0.14)] text-fg shadow-[inset_0_1px_0_oklch(1_0_0/0.13)]",
        sizeClass,
        active && "ring-2 ring-accent/50",
        className
      )}
      style={{ background: option.gradient }}
      title={option.label}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_0%,oklch(1_0_0/0.24),transparent_54%)]" />
      <Icon size={iconSize} strokeWidth={2} className="relative drop-shadow-[0_1px_4px_oklch(0.1_0.02_70/0.45)]" />
    </span>
  );
}
