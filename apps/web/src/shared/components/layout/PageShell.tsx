import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { Container } from "../container";

import { LAYOUT_TOKENS } from "./layout-tokens";

export interface PageShellProps {
  /** 페이지 본문. */
  children: ReactNode;
  /** 본문 앞에 렌더되는 히어로 슬롯 (HeroBlock 권장). */
  hero?: ReactNode;
  /** 본문 최대 너비 — 기존 `Container` 사이즈와 동일. 기본값 "wide"(1320px). */
  size?: "default" | "wide";
  /** 외곽 래퍼 추가 클래스. */
  className?: string;
}

/**
 * 페이지 외곽 셸 — 배경(bg-canvas), 최대 너비, 헤더 여백을 통일한다.
 *
 * 사용 예:
 * ```tsx
 * <PageShell hero={<HeroBlock title="..." />}>
 *   <SectionContainer title="...">...</SectionContainer>
 * </PageShell>
 * ```
 *
 * reduced-motion/다크모드는 토큰 기반이라 별도 분기 없이 자동 대응한다.
 */
export function PageShell({ children, hero, size = "wide", className }: PageShellProps) {
  return (
    <div className={cx(LAYOUT_TOKENS.page, className)}>
      <Container size={size}>
        {hero}
        {children}
      </Container>
    </div>
  );
}
