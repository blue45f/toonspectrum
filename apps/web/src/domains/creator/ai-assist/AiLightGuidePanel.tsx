import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { suggestShadowHighlight, type AiLightDirection } from "./ai-color-hint-engine";

const DIRECTIONS: readonly { value: AiLightDirection; dx: number; dy: number; ko: string }[] = [
  { value: "top-left", dx: -1, dy: -1, ko: "좌상" },
  { value: "top", dx: 0, dy: -1, ko: "상" },
  { value: "top-right", dx: 1, dy: -1, ko: "우상" },
  { value: "left", dx: -1, dy: 0, ko: "좌" },
  { value: "right", dx: 1, dy: 0, ko: "우" },
  { value: "bottom-left", dx: -1, dy: 1, ko: "좌하" },
  { value: "bottom", dx: 0, dy: 1, ko: "하" },
  { value: "bottom-right", dx: 1, dy: 1, ko: "우하" },
];

interface AiLightGuidePanelProps {
  /** 채색된 영역들의 합집합 바운딩 박스 (px) */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly canvasSize: number;
  readonly intensity: number;
}

/**
 * 그림자·하이라이트 가이드 — 광원 방향을 고르면
 * "어디를 어둡게/밝게 칠할지"를 도식으로 보여준다.
 *
 * 사용성: 나침반 버튼 8개 + 미니 도식. 텍스트 설명 대신 시각으로.
 */
export function AiLightGuidePanel({ bounds, canvasSize, intensity }: AiLightGuidePanelProps) {
  const t = useBilingual("ai-assist");
  const [light, setLight] = useState<AiLightDirection>("top-left");

  const guide = useMemo(
    () => (bounds ? suggestShadowHighlight(bounds, light, intensity) : null),
    [bounds, light, intensity],
  );

  if (!bounds || !guide) {
    return (
      <div className="ai-light" role="status">
        <p className="ai-light__empty">
          {t("AI 채색을 먼저 실행하면 음영 가이드를 볼 수 있어요", "Run AI coloring first to see shading guides")}
        </p>
      </div>
    );
  }

  const toPct = (v: number): number => (v / canvasSize) * 100;
  const zone = (r: { x: number; y: number; width: number; height: number }) => ({
    left: `${toPct(r.x)}%`,
    top: `${toPct(r.y)}%`,
    width: `${toPct(r.width)}%`,
    height: `${toPct(r.height)}%`,
  });

  return (
    <div className="ai-light">
      <h4 className="ai-light__title">{t("그림자·하이라이트 가이드", "Shadow & highlight guide")}</h4>
      <div className="ai-light__body">
        {/* 광원 방향 나침반 */}
        <div className="ai-light__compass" role="group" aria-label={t("광원 방향", "Light direction")}>
          {[-1, 0, 1].map((dy) =>
            [-1, 0, 1].map((dx) => {
              if (dx === 0 && dy === 0) {
                return (
                  <span key="center" className="ai-light__sun" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <circle cx="12" cy="12" r="5" fill="#ffd43b" />
                      <g stroke="#ffd43b" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="1" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="1" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="23" y2="12" />
                      </g>
                    </svg>
                  </span>
                );
              }
              const dir = DIRECTIONS.find((d) => d.dx === dx && d.dy === dy);
              if (!dir) return <span key={`${dx}${dy}`} />;
              const active = light === dir.value;
              const angleDeg = (Math.atan2(dir.dy, dir.dx) * 180) / Math.PI + 90;
              return (
                <button
                  key={dir.value}
                  type="button"
                  className={`ai-light__dir${active ? " ai-light__dir--active" : ""}`}
                  onClick={() => setLight(dir.value)}
                  aria-pressed={active}
                  aria-label={t(`광원: ${dir.ko}`, `Light: ${dir.value}`)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <g transform={`rotate(${angleDeg} 12 12)`}>
                      <path d="M12 4 L17 15 L12 12.4 L7 15 Z" fill="currentColor" />
                    </g>
                  </svg>
                </button>
              );
            }),
          )}
        </div>

        {/* 미니 도식 — 그림자/하이라이트 영역 */}
        <div className="ai-light__diagram" aria-hidden="true">
          <div className="ai-light__zone" style={zone(bounds)}>
            <div className="ai-light__shadow" style={{ ...zone(guide.shadow), opacity: guide.shadowOpacity }} />
            <div className="ai-light__highlight" style={{ ...zone(guide.highlight), opacity: guide.highlightOpacity }} />
          </div>
        </div>

        <ul className="ai-light__legend">
          <li>
            <span className="ai-light__swatch ai-light__swatch--shadow" aria-hidden="true" />
            {t(`그림자 영역 (농도 ${Math.round(guide.shadowOpacity * 100)}%)`, `Shadow (${Math.round(guide.shadowOpacity * 100)}%)`)}
          </li>
          <li>
            <span className="ai-light__swatch ai-light__swatch--highlight" aria-hidden="true" />
            {t(`하이라이트 영역 (농도 ${Math.round(guide.highlightOpacity * 100)}%)`, `Highlight (${Math.round(guide.highlightOpacity * 100)}%)`)}
          </li>
        </ul>
      </div>
    </div>
  );
}
