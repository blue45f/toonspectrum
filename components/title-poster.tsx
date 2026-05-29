import type { Title } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AdultOverlay } from "./adult-overlay";

const SIZE = {
  sm: { pad: "p-2.5", title: "text-sm leading-[1.15]", type: "text-[0.6rem]", wm: "text-[3.5rem]" },
  md: { pad: "p-3", title: "text-base leading-[1.12]", type: "text-[0.65rem]", wm: "text-[5rem]" },
  lg: { pad: "p-4", title: "text-xl leading-[1.1]", type: "text-xs", wm: "text-[7rem]" },
  hero: { pad: "p-5", title: "text-3xl leading-[1.05]", type: "text-sm", wm: "text-[10rem]" },
} as const;

// 타이포그래픽 커버 — 실제 이미지 대신 장르 그라디언트 + 활자 포스터
export function TitlePoster({
  title,
  size = "md",
  className,
  rank,
}: {
  title: Title;
  size?: keyof typeof SIZE;
  className?: string;
  rank?: number;
}) {
  const s = SIZE[size];
  const [from, to] = title.cover;
  const isNovel = title.type === "webnovel";
  // 제목 첫 글자 — 워터마크 글리프
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/g, "").charAt(0) || "W";

  return (
    <div
      className={cn(
        "relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-line",
        className
      )}
      style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
    >
      {/* 실제 표지 이미지 (있을 때 우선) */}
      {title.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={title.coverImage}
          alt={`${title.title} 표지`}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {/* 상단 sheen */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 0%, oklch(1 0 0 / 0.18), transparent 55%)",
        }}
      />
      {/* 필름 그레인 */}
      <div className="noise pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay" aria-hidden />
      {/* 워터마크 글리프 (이미지 없을 때만) */}
      {!title.coverImage && (
        <div
          className={cn(
            "absolute -right-2 top-1 select-none font-bold leading-none text-fg/10 mix-blend-overlay",
            isNovel ? "font-serif" : "font-display",
            s.wm
          )}
          aria-hidden
        >
          {glyph}
        </div>
      )}
      {/* 하단 스크림 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

      {/* 타입 칩 */}
      <div className={cn("absolute left-0 top-0 flex items-center gap-1", s.pad)}>
        <span
          className={cn(
            "rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm",
            s.type
          )}
        >
          {isNovel ? "NOVEL" : "TOON"}
        </span>
      </div>

      {/* 랭크 넘버럴 */}
      {rank != null && (
        <div className="absolute right-2 top-2 numeral text-2xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {rank}
        </div>
      )}

      {/* 제목 + 작가 */}
      <div className={cn("absolute inset-x-0 bottom-0 flex flex-col gap-1", s.pad)}>
        <h3
          className={cn(
            "font-bold text-white text-balance line-clamp-3 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]",
            isNovel ? "font-serif tracking-tight" : "tracking-[-0.01em]",
            s.title
          )}
        >
          {title.title}
        </h3>
        {size !== "sm" && (
          <p className="truncate text-xs text-white/70">
            {title.author}
            {title.artist && title.artist !== title.author ? ` · 그림 ${title.artist}` : ""}
          </p>
        )}
      </div>

      {/* 19금 성인 인증 게이트 */}
      {title.ageRating === "19" && <AdultOverlay compact={size === "sm"} />}
    </div>
  );
}
