import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { XrDepthArt, XrEmptyArt } from "./XrWebtoonArt";
import {
  xrCardStyle,
  xrGhostButtonStyle,
  xrNextStepStyle,
  xrSubtitleStyle,
  xrTitleStyle,
} from "./xr-webtoon-ui";
import { useXrPrefersReducedMotion } from "./xr-webtoon-hooks";
import {
  xrDepthCutCenteredness,
  xrDepthCutProgress,
  xrDepthFadeForCenteredness,
  xrDepthLayerTransform,
  type XrDepthCut,
  type XrDepthIntensity,
} from "./xr-webtoon-depth-model";

export interface XrWebtoonDepthViewerProps {
  readonly cuts: readonly XrDepthCut[];
  readonly initialIntensity?: XrDepthIntensity;
  readonly className?: string;
}

const INTENSITY_ORDER: readonly XrDepthIntensity[] = ["off", "subtle", "vivid"];

/**
 * 스크롤 패럴랙스 3D 웹툰 뷰어.
 *
 * 10초 룰: "스크롤해서 감상하세요" 한 문장으로 충분하다.
 * 연출 강도 변경은 2차 컨트롤로 우상단에 둔다.
 */
export function XrWebtoonDepthViewer({
  cuts,
  initialIntensity = "subtle",
  className,
}: XrWebtoonDepthViewerProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-depth-viewer");
  const reducedMotion = useXrPrefersReducedMotion();
  const [intensity, setIntensity] = useState<XrDepthIntensity>(initialIntensity);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const cutRefs = useRef(new Map<string, HTMLDivElement>());
  const rafRef = useRef(0);

  const readScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    readScroll();
    const onScroll = (): void => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(readScroll);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [readScroll]);

  const cycleIntensity = useCallback(() => {
    setIntensity((prev) => {
      const next = INTENSITY_ORDER[(INTENSITY_ORDER.indexOf(prev) + 1) % INTENSITY_ORDER.length];
      return next ?? "subtle";
    });
  }, []);

  const intensityLabel =
    intensity === "vivid"
      ? t("입체감 강하게", "Strong depth")
      : intensity === "subtle"
        ? t("입체감 은은하게", "Subtle depth")
        : t("입체감 끄기", "Depth off");

  return (
    <section className={className} style={xrCardStyle} aria-labelledby="xr-depth-title">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h2 id="xr-depth-title" style={xrTitleStyle}>
            {t("스크롤할수록 깊어지는 웹툰", "Webtoons that deepen as you scroll")}
          </h2>
          <p style={xrSubtitleStyle}>
            {t(
              "배경·인물·말풍선을 서로 다른 깊이 층에 나눠 담았습니다. 스크롤하면 층마다 따로 움직여 장면이 살아나요.",
              "Background, characters and speech bubbles live on separate depth layers. They drift apart as you scroll, bringing the scene alive.",
            )}
          </p>
          <p style={{ fontSize: 14, color: "rgba(226,232,255,0.85)", margin: "0 0 12px" }}>
            {t("👇 스크롤해서 감상하세요", "👇 Scroll to enjoy")}
          </p>
          {cuts.length === 0 ? (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>🖼️</span>
              <span>
                {t(
                  "보여줄 컷이 없어요. 컷을 추가하면 여기에 깊이 층으로 나뉘어 표시됩니다.",
                  "No cuts yet. Add cuts and they'll appear here, split into depth layers.",
                )}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ flex: "0 1 300px", minWidth: 220 }}>
          {cuts.length === 0 ? (
            <XrEmptyArt title={t("빈 상태 일러스트", "Empty state illustration")} />
          ) : (
            <XrDepthArt title={t("깊이 레이어 일러스트", "Depth layer illustration")} />
          )}
        </div>
      </div>

      {cuts.length > 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
            <button
              type="button"
              onClick={cycleIntensity}
              aria-pressed={intensity !== "off"}
              style={xrGhostButtonStyle}
              aria-label={t("입체감 강도 변경", "Change depth intensity")}
            >
              {t("입체감: ", "Depth: ")}{intensityLabel}
            </button>
          </div>
          <div
            ref={containerRef}
            style={{
              overflowY: "auto",
              maxHeight: "70vh",
              borderRadius: 14,
              border: "1px solid rgba(139,92,246,0.3)",
              background: "rgba(5,8,20,0.6)",
            }}
            aria-label={t("몰입형 웹툰 뷰어. 스크롤해서 감상하세요.", "Immersive webtoon viewer. Scroll to enjoy.")}
          >
            {cuts.map((cut) => {
              const el = cutRefs.current.get(cut.id);
              const cutOffsetTop = el?.offsetTop ?? 0;
              const cutHeight = el?.offsetHeight || viewportHeight;
              const progress = xrDepthCutProgress({
                scrollTop,
                cutOffsetTop,
                cutHeight,
                viewportHeight,
              });
              const centeredness = xrDepthCutCenteredness({
                scrollTop,
                cutOffsetTop,
                cutHeight,
                viewportHeight,
              });
              const fade = xrDepthFadeForCenteredness(centeredness);
              return (
                <div
                  key={cut.id}
                  ref={(node) => {
                    if (node) cutRefs.current.set(cut.id, node);
                    else cutRefs.current.delete(cut.id);
                  }}
                  style={{ position: "relative", minHeight: "60vh", opacity: fade }}
                  aria-label={cut.title}
                >
                  {cut.layers.map((layer) => {
                    const transform = xrDepthLayerTransform({
                      scrollProgress: progress,
                      layerDepth: layer.depth,
                      intensity,
                      reducedMotion,
                    });
                    return (
                      <img
                        key={layer.id}
                        src={layer.imageUrl}
                        alt={layer.alt}
                        draggable={false}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          pointerEvents: "none",
                          transform: `translateY(${transform.translateYPx.toFixed(1)}px) scale(${transform.scale.toFixed(3)})`,
                          willChange: "transform",
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 13, color: "rgba(226,232,255,0.6)", margin: "8px 0 0" }}>
            {reducedMotion
              ? t("움직임 줄이기가 켜져 있어 정지된 화면으로 보여요.", "Reduced motion is on, so cuts are shown still.")
              : t("스크롤하면 배경과 인물이 따로 움직여요.", "Background and characters move separately as you scroll.")}
          </p>
        </>
      ) : null}
    </section>
  );
}
