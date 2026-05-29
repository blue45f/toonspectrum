"use client";

import { MotionConfig } from "motion/react";

// 전역 모션 설정 — OS 의 prefers-reduced-motion 존중
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
