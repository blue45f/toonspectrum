import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import {
  XR_VR_COMFORT_DISTANCES_M,
  xrVrGalleryLayout,
  xrVrPanelReveals,
  xrVrReadingAdvance,
  xrVrReadingBack,
  xrVrReadingJump,
  xrVrReadingProgress,
  xrVrReadingStart,
  type XrVrComfortDistance,
} from "./xr-webtoon-vr-theater";
import { XrVrArt } from "./XrWebtoonArt";
import {
  xrCardStyle,
  xrGhostButtonStyle,
  xrNextStepStyle,
  xrPrimaryButtonStyle,
  xrSecondaryButtonStyle,
  xrStatusPillStyle,
  xrSubtitleStyle,
  xrTitleStyle,
} from "./xr-webtoon-ui";

export interface XrWebtoonVrTheaterPanelProps {
  readonly cutCount: number;
  readonly support: StudioWebXrSupportSnapshot | null;
  readonly supportPending?: boolean;
  readonly sessionActive?: boolean;
  readonly error?: string | null;
  readonly onStartVr: () => void;
  readonly onEndVr: () => void;
  readonly className?: string;
}

const COMFORT_ORDER: readonly XrVrComfortDistance[] = ["near", "standard", "far"];

/**
 * VR 시어터 패널 — 대형 스크린 감상 모드.
 *
 * 10초 룰: "VR에서 보기" 버튼 하나. 거리 조절·갤러리 지도는 2차 정보로.
 * 갤러리 배치도(탑다운 도식)로 "컷들이 내 주위를 감싼다"는 개념을 시각화한다.
 */
export function XrWebtoonVrTheaterPanel({
  cutCount,
  support,
  supportPending = false,
  sessionActive = false,
  error = null,
  onStartVr,
  onEndVr,
  className,
}: XrWebtoonVrTheaterPanelProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-vr-panel");
  const [comfort, setComfort] = useState<XrVrComfortDistance>("standard");
  const [preview, setPreview] = useState(() => xrVrReadingStart(Math.max(1, cutCount)));

  const radiusM = XR_VR_COMFORT_DISTANCES_M[comfort];
  const layout = useMemo(
    () => xrVrGalleryLayout({ panelCount: Math.max(1, Math.min(cutCount, 12)), radiusM }),
    [cutCount, radiusM],
  );
  const reveals = useMemo(
    () => xrVrPanelReveals({ total: preview.total, currentIndex: preview.currentIndex }),
    [preview],
  );
  const progress = xrVrReadingProgress(preview);

  const vrSupport = support?.immersiveVr ?? "unknown";
  const vrAvailable = vrSupport === "supported" || vrSupport === "unknown";
  const statusTone = sessionActive ? "ok" : error ? "bad" : vrAvailable ? "ok" : "warn";

  // 탑다운 갤러리 지도: 시청자를 중심으로 호 배치
  const mapSize = 220;
  const mapCenter = mapSize / 2;
  const mapScale = (mapSize / 2 - 28) / radiusM;
  const panelDots = layout.map((pose, i) => ({
    x: mapCenter + pose.position[0] * mapScale,
    y: mapCenter + pose.position[2] * mapScale,
    reveal: reveals[i] ?? "locked",
  }));

  const comfortLabel =
    comfort === "near"
      ? t("가깝게", "Near")
      : comfort === "far"
        ? t("멀게", "Far")
        : t("보통", "Standard");

  return (
    <section className={className} style={xrCardStyle} aria-labelledby="xr-vr-title">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span style={xrStatusPillStyle(statusTone)}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--xr-dot)",
                boxShadow: "0 0 8px var(--xr-dot)",
              }}
            />
            {sessionActive
              ? t("VR 감상 중", "Watching in VR")
              : t("VR 시어터", "VR Theater")}
          </span>
          <h2 id="xr-vr-title" style={{ ...xrTitleStyle, marginTop: 12 }}>
            {t("컷들이 나를 감싸는 영화관", "A cinema where cuts surround you")}
          </h2>
          <p style={xrSubtitleStyle}>
            {t(
              "웹툰 컷을 VR 공간의 대형 스크린에 펼쳐 놓습니다. 고개를 돌리면 다음 컷, 시선이 머문 컷만 대사가 열려 스포일러 없이 감상해요.",
              "Webtoon cuts unfold on giant screens in VR space. Turn your head for the next cut — dialogue opens only where your gaze rests, spoiler-free.",
            )}
          </p>

          {sessionActive ? (
            <button type="button" onClick={onEndVr} style={xrSecondaryButtonStyle}>
              {t("VR 종료하기", "End VR")}
            </button>
          ) : vrAvailable ? (
            <button
              type="button"
              onClick={onStartVr}
              style={xrPrimaryButtonStyle}
              disabled={supportPending || cutCount === 0}
            >
              {t("VR에서 보기", "Watch in VR")}
            </button>
          ) : null}

          {error ? (
            <p role="alert" style={{ color: "#fda4af", fontSize: 14, marginTop: 12 }}>
              {error}
            </p>
          ) : null}

          {cutCount === 0 ? (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>🎬</span>
              <span>
                {t(
                  "감상할 컷이 없어요. 먼저 회차에 컷을 추가하면 VR 시어터에서 바로 볼 수 있습니다.",
                  "No cuts to watch yet. Add cuts to an episode first, then come back to the VR theater.",
                )}
              </span>
            </div>
          ) : null}

          {!vrAvailable && !sessionActive ? (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>🥽</span>
              <span>
                {t(
                  "이 기기에서는 VR을 열 수 없어요. Meta Quest 같은 VR 헤드셋의 브라우저에서 열어 보세요.",
                  "VR can't open on this device. Try opening this page in a VR headset browser like Meta Quest.",
                )}
              </span>
            </div>
          ) : null}

          <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "rgba(226,232,255,0.6)" }}>
              {t("스크린 거리", "Screen distance")}
            </span>
            {COMFORT_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setComfort(c)}
                aria-pressed={comfort === c}
                style={comfort === c ? xrSecondaryButtonStyle : xrGhostButtonStyle}
              >
                {c === "near" ? t("가깝게", "Near") : c === "far" ? t("멀게", "Far") : t("보통", "Standard")}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: "0 1 320px", minWidth: 240 }}>
          <XrVrArt title={t("VR 시어터 일러스트", "VR theater illustration")} />
          {/* 갤러리 배치도 + 읽기 미리보기 */}
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(10,14,34,0.55)",
              border: "1px solid rgba(139,92,246,0.25)",
            }}
          >
            <p style={{ fontSize: 12, color: "rgba(226,232,255,0.6)", margin: "0 0 8px" }}>
              {t(`갤러리 배치도 · ${comfortLabel} (${radiusM}m)`, `Gallery map · ${comfortLabel} (${radiusM}m)`)}
            </p>
            <svg
              width={mapSize}
              height={mapSize}
              viewBox={`0 0 ${mapSize} ${mapSize}`}
              role="img"
              aria-label={t("컷 배치 탑다운 도식", "Top-down cut layout diagram")}
              style={{ display: "block", margin: "0 auto" }}
            >
              <circle cx={mapCenter} cy={mapCenter} r={radiusM * mapScale} fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.6" />
              {panelDots.map((dot, i) => (
                <g key={i}>
                  <rect
                    x={dot.x - 11}
                    y={dot.y - 8}
                    width="22"
                    height="16"
                    rx="3"
                    fill={dot.reveal === "current" ? "#22d3ee" : dot.reveal === "read" ? "#8b5cf6" : "#1e293b"}
                    stroke={dot.reveal === "current" ? "#fff" : "#475569"}
                    strokeWidth={dot.reveal === "current" ? 2 : 1}
                    opacity={dot.reveal === "locked" ? 0.5 : 1}
                  />
                  <text x={dot.x} y={dot.y + 4} textAnchor="middle" fontSize="9" fill={dot.reveal === "locked" ? "#64748b" : "#fff"}>
                    {i + 1}
                  </text>
                </g>
              ))}
              {/* 시청자 */}
              <circle cx={mapCenter} cy={mapCenter} r="10" fill="#f472b6" />
              <text x={mapCenter} y={mapCenter + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
                {t("나", "Me")}
              </text>
            </svg>
            {cutCount > 0 ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
                <button type="button" onClick={() => setPreview((s) => xrVrReadingBack(s))} style={xrGhostButtonStyle} aria-label={t("이전 컷 미리보기", "Preview previous cut")}>
                  ←
                </button>
                <span style={{ fontSize: 13, color: "rgba(226,232,255,0.75)", alignSelf: "center" }} aria-live="polite">
                  {t(`컷 ${preview.currentIndex + 1} / ${preview.total} · ${Math.round(progress * 100)}%`, `Cut ${preview.currentIndex + 1} / ${preview.total} · ${Math.round(progress * 100)}%`)}
                </span>
                <button type="button" onClick={() => setPreview((s) => xrVrReadingAdvance(s))} style={xrGhostButtonStyle} aria-label={t("다음 컷 미리보기", "Preview next cut")}>
                  →
                </button>
                <button type="button" onClick={() => setPreview((s) => xrVrReadingJump(s, 0))} style={xrGhostButtonStyle} aria-label={t("첫 컷으로 돌아가기", "Back to first cut")}>
                  {t("처음", "Start")}
                </button>
              </div>
            ) : null}
            <p style={{ fontSize: 11, color: "rgba(226,232,255,0.45)", margin: "8px 0 0", textAlign: "center" }}>
              {t("파랑 = 지금 보는 컷 · 보라 = 읽음 · 어둡게 = 잠김(스포일러 방지)", "Cyan = current · Violet = read · Dark = locked (spoiler-free)")}
            </p>
          </div>
        </div>
      </div>

    </section>
  );
}
