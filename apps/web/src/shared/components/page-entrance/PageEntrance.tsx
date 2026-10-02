import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import "./page-entrance.css";

export type PageEntranceVariant = "rise" | "pop" | "slide";

interface PageEntranceProps {
  readonly variant?: PageEntranceVariant;
  readonly className?: string;
  readonly children: ReactNode;
}

/** 진입 모션 총 길이(ms). CSS animation-duration과 맞춘다. */
const ENTRANCE_DURATION_MS = 880;

/** matchMedia가 없는 환경(jsdom 등)에서는 모션을 끈 것으로 본다. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 페이지 첫 진입에만 한 번 도는 짧은 등장 모션 래퍼.
 *
 * - 1초가 채 되기 전에 끝나고, 끝나면 래퍼는 평범한 div로 남는다(자식 재마운트 없음).
 * - 화면을 누르거나 ESC를 누르면 즉시 최종 상태로 건너뛴다.
 * - `prefers-reduced-motion`이면 처음부터 모션 없이 렌더링한다.
 * - 로딩 스켈레톤은 자식으로 그대로 두므로 스켈레톤과 따로 놀지 않는다.
 */
export function PageEntrance({ variant = "rise", className, children }: PageEntranceProps) {
  const [skipped, setSkipped] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const skip = () => setSkipped(true);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(skip, ENTRANCE_DURATION_MS);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, []);

  const done = skipped || reducedMotion;

  return (
    <div
      className={cn("page-entrance", className)}
      data-entrance={variant}
      data-entrance-done={done ? "true" : undefined}
      onPointerDown={done ? undefined : () => setSkipped(true)}
    >
      {children}
    </div>
  );
}
