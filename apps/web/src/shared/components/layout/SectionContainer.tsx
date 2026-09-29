import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import { LAYOUT_TOKENS, type LayoutSectionSpacing } from "./layout-tokens";

export interface SectionContainerProps {
  /** 섹션 본문. */
  children: ReactNode;
  /** 섹션 헤더 eyebrow (영문 라벨 권장). */
  eyebrow?: ReactNode;
  /** 섹션 헤더 제목. 문자열이면 h2로 렌더되고 aria-labelledby에 연결된다. */
  title?: ReactNode;
  /** 섹션 헤더 설명 문단. */
  description?: ReactNode;
  /** 헤더 정렬. center면 헤더 전체가 가운데 정렬된다. */
  align?: "left" | "center";
  /** 섹션 수직 리듬 — `layout-tokens.ts`의 py 스케일 중 하나. */
  spacing?: LayoutSectionSpacing;
  /** 섹션 id — 있으면 제목 h2의 id로 `{id}-title`을 연결한다. */
  id?: string;
  /** 추가 클래스. */
  className?: string;
}

/**
 * 섹션 수직 리듬 통일용 컨테이너 — eyebrow/title/description 헤더 패턴 + align variants.
 *
 * 사용 예:
 * ```tsx
 * <SectionContainer id="plans" eyebrow="PLANS" title="요금제" description="..." align="center">
 *   ...
 * </SectionContainer>
 * ```
 */
export function SectionContainer({
  children,
  eyebrow,
  title,
  description,
  align = "left",
  spacing = "default",
  id,
  className,
}: SectionContainerProps) {
  const centered = align === "center";
  const titleId = title != null && id ? `${id}-title` : undefined;
  const hasHeader = eyebrow != null || title != null || description != null;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cx(LAYOUT_TOKENS.sectionSpacing[spacing], className)}
    >
      {hasHeader ? (
        <div
          className={cx(
            "mb-8 sm:mb-10",
            centered && "flex flex-col items-center text-center"
          )}
        >
          {eyebrow != null && (
            <p className={cx(LAYOUT_TOKENS.type.eyebrow, centered && "justify-center")}>
              {eyebrow}
            </p>
          )}
          {title != null && (
            <h2 id={titleId} className={cx(LAYOUT_TOKENS.type.sectionTitle, eyebrow != null && "mt-2")}>
              {title}
            </h2>
          )}
          {description != null && (
            <p className={cx(LAYOUT_TOKENS.type.sectionDescription, centered && "mx-auto")}>
              {description}
            </p>
          )}
        </div>
      ) : null}
      {children}
    </section>
  );
}
