/**
 * 타이포그래픽 커버 — 아트 이미지가 없는 카드의 기본 커버.
 *
 * 디자인 시안 P-4: 제목을 읽는 대신 "색과 글자"로 항목을 식별하게 한다.
 * 제목 전문은 카드 본문의 제목 요소가 담당하므로, 커버는 중복 읽기를 피하려고
 * 제목 첫 글자를 큰 글리프로만 보여 주고 장식 영역으로 표시한다(aria-hidden).
 * 색은 식별값(seed)의 해시로 정해져 같은 항목은 어디서든 같은 색을 유지한다.
 * 장르가 알려진 작품 카드에서는 기존 TitlePoster가 우선이고, 이 컴포넌트는
 * 장르·아트가 없는 리소스/커뮤니티 카드의 공용 기본값이다.
 */

import { coverHueFromSeed } from "@/shared/lib/cover-hue";

export function TypographicCover({
  title,
  seed,
  eyebrow,
  className = "",
}: {
  /** 커버의 큰 글리프로 쓸 제목. 첫 글자만 장식으로 쓴다. */
  title: string;
  /** 색을 정하는 안정적인 식별값(id·경로·이름). */
  seed: string;
  /** 왼쪽 위에 작게 얹는 분류 라벨(제공처·게시판 종류 등). */
  eyebrow?: string;
  className?: string;
}) {
  const hue = coverHueFromSeed(seed || title);
  const glyph = title.trim().charAt(0) || "툰";
  const background = `linear-gradient(135deg, oklch(0.42 0.11 ${hue}) 0%, oklch(0.56 0.15 ${hue}) 58%, oklch(0.66 0.13 ${(hue + 42) % 360}) 100%)`;
  return (
    <div aria-hidden="true" className={`relative overflow-hidden ${className}`} style={{ background }}>
      <span className="absolute -right-7 -top-9 h-28 w-28 rounded-full border-[10px] border-white/15" />
      <span className="absolute -bottom-10 -left-5 h-24 w-24 rounded-full bg-white/15" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 select-none text-[5.2rem] font-black leading-none text-white/30">
        {glyph}
      </span>
      {eyebrow ? (
        <span className="absolute left-3 top-3 max-w-[70%] truncate text-[11px] font-bold uppercase tracking-[.14em] text-white/85">
          {eyebrow}
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}
