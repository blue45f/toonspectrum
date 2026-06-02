"use client";

import { useState } from "react";

// 표지 <img> 래퍼 — CDN 링크가 만료/404 되면 깨진 이미지 박스 대신 폴백(그라디언트+글리프)으로 전환.
export function CoverImage({
  src,
  alt,
  fallback,
  className,
  priority,
}: {
  src: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
  priority?: boolean; // above-the-fold 커버는 즉시 로드(LCP 개선)
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback ?? null}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
