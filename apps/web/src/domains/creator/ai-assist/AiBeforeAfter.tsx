import { useCallback, useId, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface AiBeforeAfterProps {
  /** 적용 전 이미지 URL */
  readonly beforeSrc: string;
  /** 적용 후 이미지 URL */
  readonly afterSrc: string;
  readonly beforeLabel?: string;
  readonly afterLabel?: string;
}

/**
 * Before/After 비교 슬라이더 — AI 적용 전후를 드래그로 비교.
 * 사용성: 핸들이 크고 명확하며, 키보드로도 조작 가능.
 * 빈 상태: 이미지가 없으면 다음 행동(선화 불러오기)을 안내.
 */
export function AiBeforeAfter({ beforeSrc, afterSrc, beforeLabel, afterLabel }: AiBeforeAfterProps) {
  const t = useBilingual("ai-assist");
  const sliderId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const beforeText = beforeLabel ?? t("적용 전", "Before");
  const afterText = afterLabel ?? t("적용 후", "After");

  const updateFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setPosition(Math.min(96, Math.max(4, Math.round(ratio * 100))));
  }, []);

  const hasImages = beforeSrc.length > 0 && afterSrc.length > 0;

  if (!hasImages) {
    return (
      <div className="ai-compare ai-compare--empty" role="status">
        <svg className="ai-compare__empty-icon" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="10" width="36" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="24" cy="24" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <p className="ai-compare__empty-text">
          {t("비교할 이미지가 없어요", "No images to compare")}
        </p>
        <p className="ai-compare__empty-hint">
          {t("선화를 불러오고 AI 채색을 실행하면 전후 비교가 표시됩니다", "Load line art and run AI coloring to see the comparison")}
        </p>
      </div>
    );
  }

  return (
    <div className="ai-compare">
      <div
        ref={trackRef}
        className="ai-compare__track"
        onPointerDown={(e) => {
          setDragging(true);
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        role="slider"
        id={sliderId}
        aria-label={t("전후 비교 슬라이더", "Before/after comparison slider")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position}
        aria-valuetext={`${beforeText} ${100 - position}% / ${afterText} ${position}%`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPosition((p) => Math.max(4, p - 5));
          if (e.key === "ArrowRight") setPosition((p) => Math.min(96, p + 5));
        }}
      >
        <img src={afterSrc} alt={afterText} className="ai-compare__img ai-compare__img--after" draggable={false} />
        <div className="ai-compare__before-clip" style={{ width: `${100 - position}%` }}>
          <img src={beforeSrc} alt={beforeText} className="ai-compare__img ai-compare__img--before" draggable={false} />
        </div>
        <div className="ai-compare__handle" style={{ left: `${100 - position}%` }} aria-hidden="true">
          <span className="ai-compare__handle-grip">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <span className="ai-compare__tag ai-compare__tag--before">{beforeText}</span>
        <span className="ai-compare__tag ai-compare__tag--after">{afterText}</span>
      </div>
      <p className="ai-compare__caption">
        {t("핸들을 드래그해서 전후를 비교하세요", "Drag the handle to compare before and after")}
      </p>
    </div>
  );
}
