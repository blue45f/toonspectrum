import { useCallback, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { MessageCircle, Sparkles, Star } from "lucide-react";

import { useT } from "@/shared/lib/i18n";

import { NOT_FOUND_QUIP_KEYS, nextQuipIndex } from "./not-found-quips";

const FLOATING_DECORATIONS = [
  { key: "star-left", icon: Star, className: "left-[7%] top-[15%]", size: 18, delay: 0, duration: 5 },
  { key: "sparkles-right", icon: Sparkles, className: "right-[8%] top-[11%]", size: 24, delay: 1.2, duration: 6 },
  { key: "bubble-left", icon: MessageCircle, className: "left-[11%] bottom-[16%]", size: 20, delay: 0.6, duration: 5.5 },
  { key: "star-right", icon: Star, className: "right-[13%] bottom-[21%]", size: 14, delay: 2, duration: 4.5 },
] as const;

/**
 * 404 섹션 위를 둥실 떠다니는 장식 (말풍선·별).
 * reduced-motion 환경에서는 정적으로 렌더한다.
 */
export function NotFoundDecorations() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {FLOATING_DECORATIONS.map(({ key, icon: Icon, className, size, delay, duration }) => (
        <motion.span
          key={key}
          className={`absolute text-accent/40 ${className}`}
          animate={prefersReducedMotion ? undefined : { y: [0, -12, 0], rotate: [0, 10, -10, 0] }}
          transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon size={size} />
        </motion.span>
      ))}
    </div>
  );
}

/**
 * 마우스를 따라 기울어지는 404 숫자 버튼.
 * 클릭(또는 엔터/스페이스)하면 랜덤 웹툰 대사가 말풍선으로 팝업된다.
 * reduced-motion 환경에서는 기울기·팝업 모션 없이 정적 렌더 + 즉시 표시한다.
 */
export function NotFoundNumber() {
  const t = useT();
  const prefersReducedMotion = useReducedMotion();
  const animated = !prefersReducedMotion;
  const [quipIndex, setQuipIndex] = useState<number | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [12, -12]), {
    stiffness: 260,
    damping: 22,
  });
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-12, 12]), {
    stiffness: 260,
    damping: 22,
  });

  const handlePointerMove = useCallback(
    (event: React.MouseEvent) => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      pointerX.set((event.clientX - rect.left) / rect.width);
      pointerY.set((event.clientY - rect.top) / rect.height);
    },
    [pointerX, pointerY],
  );

  const handlePointerLeave = useCallback(() => {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }, [pointerX, pointerY]);

  const handleTap = useCallback(() => {
    setQuipIndex((prev) => nextQuipIndex(prev ?? -1, NOT_FOUND_QUIP_KEYS.length));
  }, []);

  const quip = quipIndex === null ? null : t(NOT_FOUND_QUIP_KEYS[quipIndex]);

  return (
    <div className="relative mx-auto w-fit" style={{ perspective: 600 }}>
      <AnimatePresence>
        {quip !== null && (
          <motion.div
            key={quipIndex}
            role="status"
            className="absolute bottom-full left-1/2 z-10 mb-4 w-max max-w-[15rem] rounded-2xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg shadow-lg shadow-black/10"
            initial={animated ? { opacity: 0, x: "-50%", y: 10, scale: 0.92 } : { x: "-50%" }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={animated ? { opacity: 0, x: "-50%", y: -8, scale: 0.95 } : { opacity: 0, x: "-50%" }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
          >
            {quip}
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-line-strong bg-card"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={handleTap}
        onMouseMove={animated ? handlePointerMove : undefined}
        onMouseLeave={animated ? handlePointerLeave : undefined}
        style={animated ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        whileTap={animated ? { scale: 0.94 } : undefined}
        className="cursor-pointer text-7xl font-bold tracking-tighter text-accent sm:text-8xl"
        aria-label={t("page.notFound.tapHint")}
      >
        404
      </motion.button>
      <p className="mt-2 text-xs font-semibold text-fg-3">{t("page.notFound.tapHint")}</p>
    </div>
  );
}
