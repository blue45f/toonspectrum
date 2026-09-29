import { useEffect, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleTypewriterProps {
  /** 타이핑할 문장들. */
  lines: readonly string[];
  className?: string;
  /** 글자당 ms (기본 45). */
  speed?: number;
  /** 문장 사이 대기 ms (기본 1400). */
  pauseMs?: number;
  /** 끝나면 반복할지 (기본 true). */
  loop?: boolean;
}

/**
 * 타이핑 이펙트.
 *
 * - motion 수준에서만 타이핑, 그 외에는 전체 텍스트를 즉시 표시
 * - 스크린리더에는 전체 문장을 aria-label로 제공
 */
export function SpectacleTypewriter({
  lines,
  className,
  speed = 45,
  pauseMs = 1400,
  loop = true,
}: SpectacleTypewriterProps) {
  const { motion } = useSpectacle();
  const [lineIndex, setLineIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const fullText = lines.join(" ");

  useEffect(() => {
    if (!motion || lines.length === 0) {
      setCharCount(lines[0]?.length ?? 0);
      return;
    }
    const current = lines[lineIndex % lines.length];
    if (charCount < current.length) {
      const timer = window.setTimeout(() => setCharCount((c) => c + 1), speed);
      return () => window.clearTimeout(timer);
    }
    // 문장 완성 → 대기 후 다음 문장
    if (loop || lineIndex < lines.length - 1) {
      const timer = window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % lines.length);
        setCharCount(0);
      }, pauseMs);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [motion, lines, lineIndex, charCount, speed, pauseMs, loop]);

  if (!motion || lines.length === 0) {
    return <span className={className}>{lines[0] ?? ""}</span>;
  }

  const current = lines[lineIndex % lines.length];
  const visible = current.slice(0, charCount);

  return (
    <span
      className={cn("spectacle-typewriter", "spectacle-type-caret", className)}
      aria-label={fullText}
    >
      <span aria-hidden="true">{visible}</span>
    </span>
  );
}
