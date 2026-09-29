import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";

/** 홈 시네마틱 레이어: 그라디언트 메시, 플로팅 카드, 모션 타이포, 스크롤 리빌. */
export interface CinematicFloatCard {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
}

const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

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

const CINEMATIC_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_CINEMATIC } },
} as const;

/** 히어로 배경의 다중 radial-gradient 메시 레이어. 장식용이므로 스크린 리더에서 숨긴다. */
export function CinematicHeroMesh() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="cf-cinematic-mesh" aria-hidden="true" data-reduced-motion={reducedMotion}>
      {[1, 2, 3].map((layer) => (
        <motion.span
          key={layer}
          className={`cf-cinematic-mesh-layer cf-cinematic-mesh-layer--${layer}`}
          animate={reducedMotion ? undefined : {
            x: [0, 46 - layer * 12, -24 + layer * 6, 0],
            y: [0, -34 + layer * 8, 22 - layer * 4, 0],
            scale: [1, 1.14, 0.94, 1],
          }}
          transition={reducedMotion ? undefined : {
            duration: 16 + layer * 7,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function CinematicFloatCardView({
  card,
  index,
  pointerX,
  pointerY,
  reducedMotion,
}: {
  card: CinematicFloatCard;
  index: number;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const depth = index === 0 ? 16 : -11;
  const x = useTransform(pointerX, (value) => (reducedMotion ? 0 : value * depth));
  const y = useTransform(pointerY, (value) => (reducedMotion ? 0 : value * depth));
  if (reducedMotion) {
    return (
      <div className={`cf-cinematic-float-card cf-cinematic-float-card--${index + 1}`} data-reduced-motion="true">
        <span className="cf-cinematic-float-art" aria-hidden="true" />
        <span className="cf-cinematic-float-copy">
          <span className="cf-cinematic-float-tag">{card.tag}</span>
          <strong>{card.title}</strong>
          <span>{card.body}</span>
        </span>
      </div>
    );
  }
  return (
    <motion.div
      className={`cf-cinematic-float-card cf-cinematic-float-card--${index + 1}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.55 + index * 0.2, ease: EASE_CINEMATIC }}
    >
      <motion.div className="cf-cinematic-float-parallax" style={{ x, y }}>
        <div className="cf-cinematic-float-inner">
          <span className="cf-cinematic-float-art" aria-hidden="true" />
          <span className="cf-cinematic-float-copy">
            <span className="cf-cinematic-float-tag">{card.tag}</span>
            <strong>{card.title}</strong>
            <span>{card.body}</span>
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * 히어로 비주얼: 기존 figure 마크업을 감싸 마우스 패럴랙스 플로팅 3D 아트 카드를 올린다.
 * 자식으로 전달된 img/figcaption은 그대로 유지해 이미지 계약(3개 img)을 깨지 않는다.
 */
export function CinematicHeroVisual({
  cards,
  children,
}: {
  cards: readonly CinematicFloatCard[];
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const frameRef = useRef<HTMLElement | null>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const handlePointerMove = reducedMotion
    ? undefined
    : (event: ReactPointerEvent<HTMLElement>) => {
        const rect = frameRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
        pointerY.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
      };
  const handlePointerLeave = reducedMotion ? undefined : () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <motion.figure
      ref={frameRef}
      className="cf-home-preview cf-production-preview cf-cinematic-visual"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-reduced-motion={reducedMotion}
    >
      {children}
      {cards.map((card, index) => (
        <CinematicFloatCardView
          key={card.title}
          card={card}
          index={index}
          pointerX={pointerX}
          pointerY={pointerY}
          reducedMotion={reducedMotion}
        />
      ))}
    </motion.figure>
  );
}

/** 히어로 제목의 단어별 스태거 등장. h1 시맨틱과 id는 그대로 둔다. */
export function CinematicHeadline({ id, lines }: { id: string; lines: readonly [string, string] }) {
  const reducedMotion = useReducedMotion();
  return (
    <h1 id={id} className="cf-cinematic-headline" data-reduced-motion={reducedMotion}>
      {lines.map((line, lineIndex) => {
        const words = line.split(" ");
        const lineContent = words.map((word, wordIndex) => (
          <span key={`${lineIndex}-${wordIndex}`} className="cf-cinematic-word-wrap">
            {reducedMotion ? (
              <span className="cf-cinematic-word">{word}</span>
            ) : (
              <motion.span
                className="cf-cinematic-word"
                initial={{ opacity: 0, y: "0.55em", filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  duration: 0.75,
                  delay: 0.12 + (lineIndex * 5 + wordIndex) * 0.09,
                  ease: EASE_CINEMATIC,
                }}
              >
                {word}
              </motion.span>
            )}
            {wordIndex < words.length - 1 ? " " : null}
          </span>
        ));
        return (
          <span key={lineIndex} className="cf-cinematic-line">
            {lineIndex === 1 ? <em>{lineContent}</em> : lineContent}
            {lineIndex === 0 ? <br /> : null}
          </span>
        );
      })}
    </h1>
  );
}

/** 뷰포트 진입 시 페이드+상승. 자식 CinematicItem과는 variants로 스태거를 공유한다. */
export function CinematicReveal({
  id,
  className,
  labelledBy,
  children,
  delay = 0,
  tag = "section",
}: {
  id?: string;
  className?: string;
  labelledBy?: string;
  children: ReactNode;
  delay?: number;
  tag?: "section" | "div";
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) {
    const StaticTag = tag;
    return (
      <StaticTag id={id} className={className} aria-labelledby={labelledBy} data-cinematic="static">
        {children}
      </StaticTag>
    );
  }
  const RevealTag = tag === "div" ? motion.div : motion.section;
  // IntersectionObserver가 없는 환경(jsdom, 구형 브라우저)에서는 whileInView가
  // 동작하지 않아 섹션이 영원히 hidden 상태로 남으므로 즉시 표시로 폴백한다.
  const canObserveViewport = typeof IntersectionObserver !== "undefined";
  return (
    <RevealTag
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      data-cinematic="reveal"
      variants={CINEMATIC_CONTAINER_VARIANTS}
      initial="hidden"
      {...(canObserveViewport ? { whileInView: "show" as const } : { animate: "show" as const })}
      viewport={{ once: true, amount: 0.12 }}
      custom={delay}
    >
      {children}
    </RevealTag>
  );
}

/** CinematicReveal 안에서 스태거되는 카드 단위. reduced motion이면 일반 요소로 렌더링한다. */
export function CinematicItem({
  as = "li",
  className,
  dataWorkflowStep,
  ariaLabel,
  children,
}: {
  as?: "li" | "article" | "p" | "div";
  className?: string;
  dataWorkflowStep?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) {
    const StaticTag = as;
    return (
      <StaticTag
        className={className}
        data-workflow-step={dataWorkflowStep}
        aria-label={ariaLabel}
        data-cinematic="static-item"
      >
        {children}
      </StaticTag>
    );
  }
  const ItemTag =
    as === "article" ? motion.article : as === "p" ? motion.p : as === "div" ? motion.div : motion.li;
  return (
    <ItemTag
      className={className}
      data-workflow-step={dataWorkflowStep}
      aria-label={ariaLabel}
      data-cinematic="item"
      variants={CINEMATIC_ITEM_VARIANTS}
      /* motion의 인라인 transform이 기존 CSS :hover 리프트를 덮으므로 whileHover로 유지한다. */
      whileHover={{ y: -3 }}
    >
      {children}
    </ItemTag>
  );
}

const JUMP_NAV_ROOT_MARGIN = "-38% 0px -55% 0px";

/** 점프 내비 활성 섹션 추적. data-active-section과 함께 CSS로 활성 링크를 표시한다. */
export function useCinematicJumpNavActive(sectionIds: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace(/^#/u, "");
    return sectionIds.includes(hash) ? hash : null;
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: JUMP_NAV_ROOT_MARGIN },
    );
    const targets = sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((element): element is HTMLElement => element !== null);
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}
