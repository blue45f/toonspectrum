export const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

/**
 * 스크롤 리빌 컨테이너 variants. 섹션 자체의 페이드+상승과
 * 자식 CinematicItem의 스태거를 함께 구동한다.
 */
export const CINEMATIC_CONTAINER_VARIANTS = {
  hidden: { opacity: 0, y: 32 },
  show: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: EASE_CINEMATIC,
      staggerChildren: 0.09,
      delayChildren: delay,
    },
  }),
} as const;

export const CINEMATIC_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_CINEMATIC } },
} as const;
