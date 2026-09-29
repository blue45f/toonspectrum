/**
 * 공용 레이아웃 시스템 토큰 (apps/web/src/shared/components/layout)
 *
 * 마케팅/안내 페이지 감사(2026-09-30: `/`, `/pricing`, `/about/studio`, `/events`,
 * `/product-tour`, `/membership`)에서 뽑아낸 공통 스케일을 Tailwind 클래스 문자열로
 * 고정한다. 색상은 `app/styles/globals.css`의 `@theme`에 정의된 기존 토큰만 사용하고
 * 새 색상을 만들지 않는다 (다크모드·대비 테마는 토큰 기반으로 자동 대응).
 */
export const LAYOUT_TOKENS = {
  /** 페이지 외곽 — 헤더 높이만큼 확보한 최소 높이 + 캔버스 배경 + 페이지 수직 여백. */
  page: "min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas py-7 sm:py-10 lg:py-12",
  /** 본문 최대 너비 — 기존 `Container` size="wide"(1320px)와 동일. */
  maxWidth: "max-w-[1320px]",
  /** 본문 좌우 여백 — 기존 `Container`와 동일. */
  gutter: "px-4 sm:px-6",

  /** 섹션 수직 리듬. 페이지 내부에서 연속 섹션은 `mt-*` 대신 이 py 스케일 중 하나를 택한다. */
  sectionSpacing: {
    compact: "py-10 sm:py-12",
    default: "py-12 sm:py-16 lg:py-20",
    roomy: "py-16 sm:py-20 lg:py-24",
  },

  /** 히어로 카드(배너형) 컨테이너 — Pricing/Membership 히어로와 동일. */
  heroCard: "relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 sm:p-9",

  /** 타이포 스케일 */
  type: {
    /** 히어로 H1 — font-display + 4xl/6xl (PricingPage·MembershipPolicyPage 기준). */
    heroTitle: "font-display text-4xl font-black tracking-[-0.04em] text-fg sm:text-6xl",
    /** 섹션 H2 — font-display + 3xl/4xl. */
    sectionTitle: "font-display text-3xl font-black tracking-tight text-fg sm:text-4xl",
    /** 히어로 리드 문단. */
    heroLede: "mt-5 max-w-3xl text-base leading-7 text-fg-2 sm:text-lg",
    /** 섹션 설명 문단. */
    sectionDescription: "mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base",
    /** 영문 eyebrow 라벨 — 전역 `@utility eyebrow` (display, uppercase, 0.16em, 0.7rem). */
    eyebrow: "eyebrow flex items-center gap-2 text-accent",
    /** 히어로용 pill eyebrow — Pricing/Membership 히어로와 동일. */
    heroEyebrow:
      "inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent",
  },

  /** 카드 스케일 (감사: rounded-2xl/3xl + border-line + bg-panel). */
  card: {
    default: "rounded-2xl border border-line bg-panel p-5",
    large: "rounded-3xl border border-line bg-panel p-6 sm:p-8",
  },
  radius: {
    card: "rounded-2xl",
    panel: "rounded-3xl",
    hero: "rounded-[2rem]",
  },
  shadow: {
    subtle: "shadow-sm",
    none: "shadow-none",
  },
} as const;

export type LayoutSectionSpacing = keyof typeof LAYOUT_TOKENS.sectionSpacing;
