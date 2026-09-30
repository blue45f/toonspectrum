import { useCallback, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { AiIntensityControl } from "./AiIntensityControl";
import {
  generatePerspectiveGrid,
  suggestVanishingPoints,
  type AiPerspectiveType,
} from "./ai-perspective-grid";

const VIEW_SIZE = 320;

const TYPE_OPTIONS: readonly { value: AiPerspectiveType; ko: string; en: string }[] = [
  { value: "one-point", ko: "1점 투시", en: "1-point" },
  { value: "two-point", ko: "2점 투시", en: "2-point" },
  { value: "three-point", ko: "3점 투시", en: "3-point" },
];

interface Vp {
  readonly x: number;
  readonly y: number;
}

/**
 * AI 투시 그리드 스튜디오 — 배경 작화용 원근 보조선.
 *
 * 사용성 (10초 규칙):
 * 1. 소실점을 드래그하면 그리드가 즉시 따라옴 — "만지는 재미"
 * 2. 핵심 액션 1개: "그리드에 맞게 그리기 시작"은 배경 에디터 연결 안내
 * 3. 고급 설정 접기: 선 간격·투명도는 details 안
 */
export function AiPerspectiveStudio() {
  const t = useBilingual("ai-assist");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIndexRef = useRef<number | null>(null);

  const [type, setType] = useState<AiPerspectiveType>("two-point");
  const [vps, setVps] = useState<readonly Vp[]>(() => suggestVanishingPoints("two-point", VIEW_SIZE, VIEW_SIZE));
  const [spacing, setSpacing] = useState(48);
  const [opacity, setOpacity] = useState(0.7);
  const [showDemoBox, setShowDemoBox] = useState(true);

  const changeType = useCallback((next: AiPerspectiveType) => {
    setType(next);
    setVps(suggestVanishingPoints(next, VIEW_SIZE, VIEW_SIZE));
  }, []);

  const lines = useMemo(
    () =>
      generatePerspectiveGrid({
        type,
        width: VIEW_SIZE,
        height: VIEW_SIZE,
        vanishingPoints: vps,
        spacing,
      }),
    [type, vps, spacing],
  );

  // 소실점 드래그 — SVG 좌표로 변환
  const toSvgPoint = useCallback((clientX: number, clientY: number): Vp => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_SIZE,
      y: ((clientY - rect.top) / rect.height) * VIEW_SIZE,
    };
  }, []);

  const handleVpPointerDown = (index: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIndexRef.current = index;
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const index = dragIndexRef.current;
    if (index === null) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    setVps((prev) => prev.map((vp, i) => (i === index ? p : vp)));
  };

  const handleSvgPointerUp = (): void => {
    dragIndexRef.current = null;
  };

  const resetVps = useCallback(() => {
    setVps(suggestVanishingPoints(type, VIEW_SIZE, VIEW_SIZE));
  }, [type]);

  const horizonY = vps[0]?.y ?? VIEW_SIZE / 2;

  return (
    <section className="ai-studio" aria-label={t("AI 투시 그리드", "AI perspective grid")}>
      <div className="ai-studio__workspace">
        <div className="ai-studio__canvas-wrap">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            className="ai-studio__canvas ai-studio__persp"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
            aria-label={t("투시 그리드 — 소실점(분홍색 점)을 드래그하세요", "Perspective grid — drag the vanishing points (pink dots)")}
            style={{ touchAction: "none", opacity: 1 }}
          >
            <rect x="0" y="0" width={VIEW_SIZE} height={VIEW_SIZE} fill="#ffffff" />
            {/* 데모: 배경 박스 */}
            {showDemoBox && (
              <g opacity="0.9">
                <polygon points="110,190 170,190 170,260 110,260" fill="#ffd43b" stroke="#1a1a2e" strokeWidth="2.5" />
                <polygon points="170,190 210,170 210,240 170,260" fill="#ffa94d" stroke="#1a1a2e" strokeWidth="2.5" />
                <polygon points="110,190 170,190 210,170 150,170" fill="#ffe066" stroke="#1a1a2e" strokeWidth="2.5" />
              </g>
            )}
            <g opacity={opacity}>
              {lines.map((line, i) => (
                <path
                  key={i}
                  d={line.d}
                  fill="none"
                  stroke={line.kind === "horizon" ? "#ff5d8f" : "#7c5cff"}
                  strokeWidth={line.kind === "horizon" ? 2.5 : 1.2}
                  strokeDasharray={line.kind === "vertical" ? "5 4" : undefined}
                />
              ))}
            </g>
            {/* 소실점 핸들 */}
            {vps.map((vp, i) => (
              <g key={i}>
                <circle
                  cx={vp.x}
                  cy={vp.y}
                  r="14"
                  fill="transparent"
                  onPointerDown={handleVpPointerDown(i)}
                  style={{ cursor: "grab" }}
                >
                  <title>{t(`소실점 ${i + 1} — 드래그`, `Vanishing point ${i + 1} — drag`)}</title>
                </circle>
                <circle
                  cx={vp.x}
                  cy={vp.y}
                  r="7"
                  fill="#ff5d8f"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  pointerEvents="none"
                />
                <text x={vp.x + 11} y={vp.y - 9} fontSize="11" fill="#ff5d8f" fontWeight="700" pointerEvents="none">
                  {t(`소실점 ${i + 1}`, `VP${i + 1}`)}
                </text>
              </g>
            ))}
          </svg>
          <p className="ai-studio__canvas-hint">
            {t("① 분홍색 소실점을 드래그해서 원근을 조정하세요", "① Drag the pink vanishing points to adjust perspective")}
          </p>
        </div>

        <div className="ai-studio__controls">
          <div className="ai-studio__mood-row" role="group" aria-label={t("투시 종류", "Perspective type")}>
            <span className="ai-studio__field-label" id="ai-persp-type-label">
              {t("투시 종류", "Type")}
            </span>
            <div className="ai-studio__segment" role="radiogroup" aria-labelledby="ai-persp-type-label">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={type === o.value}
                  className={`ai-studio__segment-btn${type === o.value ? " ai-studio__segment-btn--active" : ""}`}
                  onClick={() => changeType(o.value)}
                >
                  {o.ko}
                </button>
              ))}
            </div>
          </div>

          <AiIntensityControl
            value={opacity}
            onChange={setOpacity}
            label={t("그리드 투명도", "Grid opacity")}
          />

          <div className="ai-studio__secondary-row">
            <button type="button" className="ai-studio__ghost" onClick={resetVps}>
              {t("소실점 초기화", "Reset vanishing points")}
            </button>
            <button
              type="button"
              className="ai-studio__ghost"
              onClick={() => setShowDemoBox((v) => !v)}
              aria-pressed={showDemoBox}
            >
              {showDemoBox ? t("데모 박스 숨기기", "Hide demo box") : t("데모 박스 보기", "Show demo box")}
            </button>
          </div>

          <details className="ai-studio__advanced">
            <summary className="ai-studio__advanced-summary">{t("고급 설정", "Advanced settings")}</summary>
            <div className="ai-studio__mood-row" role="group" aria-label={t("선 간격", "Line spacing")}>
              <label className="ai-studio__field-label" htmlFor="ai-persp-spacing">
                {t("선 간격", "Spacing")}
              </label>
              <select
                id="ai-persp-spacing"
                className="ai-studio__select"
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              >
                {[24, 32, 48, 64, 96].map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
            </div>
            <p className="ai-studio__stat">
              {t(`수평선 y=${Math.round(horizonY)}px · 보조선 ${lines.length}개`, `Horizon y=${Math.round(horizonY)}px · ${lines.length} guides`)}
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
