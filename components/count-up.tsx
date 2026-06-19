"use client";

import { useEffect, useState } from "react";

// 마운트 시 0 → value 카운트업 (ease-out-quart). reduced-motion 이면 즉시 표시.
export function CountUp({
  value,
  duration = 1.1,
  suffix = "",
  className,
  separator = false,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
  /** 천 단위 구분 기호(ko-KR) 적용 — 대형 인덱스 넘버럴 가독성. */
  separator?: boolean;
}) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : duration; // reduced-motion 이면 즉시 (첫 프레임에 완료)
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = dur <= 0 ? 1 : Math.min(1, (ts - start) / (dur * 1000));
      const eased = 1 - Math.pow(1 - p, 4);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const rounded = Math.round(n);
  return (
    <span className={className}>
      {separator ? rounded.toLocaleString("ko-KR") : rounded}
      {suffix}
    </span>
  );
}
