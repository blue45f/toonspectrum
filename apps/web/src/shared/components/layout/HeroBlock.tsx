import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import { LAYOUT_TOKENS } from "./layout-tokens";

export interface HeroBlockProps {
  /** 히어로 제목 (h1). */
  title: ReactNode;
  /** pill eyebrow 라벨. */
  eyebrow?: ReactNode;
  /** 제목 아래 리드 문단. */
  lede?: ReactNode;
  /** CTA 버튼 행. */
  actions?: ReactNode;
  /** 우측/하단 미디어 슬롯 (이미지·영상·일러스트). */
  media?: ReactNode;
  /** 정렬 — left면 카피/미디어 2열, center면 카피 중앙 + 미디어 하단 풀너비. */
  align?: "left" | "center";
  /** h1의 id — 섹션에서 aria-labelledby로 연결할 때 사용. */
  titleId?: string;
  /** 추가 클래스. */
  className?: string;
}

/**
 * 히어로 공용 블록 — Pricing/Membership 히어로 카드 패턴을 표준화한다.
 * (eyebrow pill / display h1 / 리드 / 액션 / 미디어 슬롯)
 *
 * 사용 예:
 * ```tsx
 * <HeroBlock
 *   eyebrow="PRICING"
 *   title={<>무료로 시작하고,<br />필요할 때 넓히세요.</>}
 *   lede="..."
 *   actions={<><PrimaryButton /><SecondaryButton /></>}
 *   media={<img ... />}
 * />
 * ```
 *
 * 정적 렌더이며 애니메이션을 포함하지 않으므로 reduced-motion 분기가 불필요하다.
 */
export function HeroBlock({
  title,
  eyebrow,
  lede,
  actions,
  media,
  align = "left",
  titleId,
  className,
}: HeroBlockProps) {
  const centered = align === "center";

  const copy = (
    <div className={cx("min-w-0", centered && "mx-auto max-w-4xl text-center")}>
      {eyebrow != null && (
        <p className={LAYOUT_TOKENS.type.heroEyebrow}>{eyebrow}</p>
      )}
      <h1 id={titleId} className={LAYOUT_TOKENS.type.heroTitle}>
        {title}
      </h1>
      {lede != null && (
        <p
          className={cx(
            LAYOUT_TOKENS.type.heroLede,
            centered && "mx-auto"
          )}
        >
          {lede}
        </p>
      )}
      {actions != null && (
        <div
          className={cx(
            "mt-7 flex flex-wrap gap-3",
            centered && "justify-center"
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );

  return (
    <header className={cx(LAYOUT_TOKENS.heroCard, className)}>
      {media == null ? (
        copy
      ) : centered ? (
        <>
          {copy}
          <div className="mt-8">{media}</div>
        </>
      ) : (
        <div className="grid items-center gap-8 lg:grid-cols-2">
          {copy}
          <div className="min-w-0">{media}</div>
        </div>
      )}
    </header>
  );
}
