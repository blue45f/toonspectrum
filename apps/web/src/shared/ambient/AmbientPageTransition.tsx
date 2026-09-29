import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

import { prefersReducedMotion, readAmbientPreferences } from "./ambient-engine";

import "./ambient-effects.css";

export interface AmbientPageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** 현재 vivid 강도인지. */
function isVivid(): boolean {
  return !prefersReducedMotion() && readAmbientPreferences().intensity === "vivid";
}

/**
 * 라우트 변경 시 시네마틱 페이지 전환.
 *
 * - pathname이 바뀌면 콘텐츠에 페이드+상승+블러 해제 모션 부여
 * - vivid 강도에서만 동작, reduced-motion에서는 비활성화
 */
export function AmbientPageTransition({ children, className }: AmbientPageTransitionProps) {
  const { pathname } = useLocation();
  const [vivid, setVivid] = useState(isVivid);

  useEffect(() => {
    const sync = () => setVivid(isVivid());
    window.addEventListener("toonstudio:ambient-intensity", sync);
    return () => window.removeEventListener("toonstudio:ambient-intensity", sync);
  }, []);

  if (!vivid) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div key={pathname} className={cn("ambient-page-enter", className)}>
      {children}
    </div>
  );
}
