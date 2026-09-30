import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import { xrArMiniatureSpec } from "./xr-webtoon-ar-placement";
import { XrArArt, XrEmptyArt } from "./XrWebtoonArt";
import {
  xrCardStyle,
  xrNextStepStyle,
  xrPrimaryButtonStyle,
  xrSecondaryButtonStyle,
  xrStatusPillStyle,
  xrSubtitleStyle,
  xrTitleStyle,
} from "./xr-webtoon-ui";

export interface XrWebtoonArPreviewPanelProps {
  readonly support: StudioWebXrSupportSnapshot | null;
  readonly supportPending?: boolean;
  readonly sessionActive?: boolean;
  readonly error?: string | null;
  readonly onStartAr: () => void;
  readonly onEndAr: () => void;
  readonly onOpenMiniature?: () => void;
  readonly className?: string;
}

/**
 * AR 프리뷰 패널.
 *
 * 10초 룰: 지원 기기에서는 "AR로 캐릭터 보기" 버튼 하나만 누르면 된다.
 * 미지원 기기에서는 좌절 대신 다음 행동(미니어처 미리보기)을 안내한다.
 */
export function XrWebtoonArPreviewPanel({
  support,
  supportPending = false,
  sessionActive = false,
  error = null,
  onStartAr,
  onEndAr,
  onOpenMiniature,
  className,
}: XrWebtoonArPreviewPanelProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-ar-panel");
  const [showHelp, setShowHelp] = useState(false);

  const arSupport = support?.immersiveAr ?? "unknown";
  const arAvailable = arSupport === "supported" || arSupport === "unknown";
  const miniature = xrArMiniatureSpec({
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight,
  });

  const statusTone = sessionActive
    ? "ok"
    : error
      ? "bad"
      : arSupport === "supported"
        ? "ok"
        : arSupport === "unsupported"
          ? "warn"
          : "idle";
  const statusText = sessionActive
    ? t("AR 실행 중", "AR running")
    : error
      ? t("시작 실패", "Failed to start")
      : supportPending
        ? t("지원 확인 중…", "Checking support…")
        : arSupport === "supported"
          ? t("AR 사용 가능", "AR available")
          : arSupport === "unsupported"
            ? t("이 기기에서 AR 미지원", "AR not supported here")
            : t("실행 시 확인", "Check on launch");

  return (
    <section className={className} style={xrCardStyle} aria-labelledby="xr-ar-title">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
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
            {statusText}
          </span>
          <h2 id="xr-ar-title" style={{ ...xrTitleStyle, marginTop: 12 }}>
            {t("내 방에 캐릭터를 소환", "Summon characters to your room")}
          </h2>
          <p style={xrSubtitleStyle}>
            {t(
              "웹툰 캐릭터를 AR로 현실 공간에 띄워 보세요. 크기와 각도를 눈으로 확인하고 컷 구도를 잡을 수 있어요.",
              "Place webtoon characters in your real space with AR. Check size and angles with your own eyes to frame the perfect cut.",
            )}
          </p>

          {sessionActive ? (
            <button type="button" onClick={onEndAr} style={xrSecondaryButtonStyle}>
              {t("AR 종료하기", "End AR")}
            </button>
          ) : arAvailable ? (
            <button
              type="button"
              onClick={onStartAr}
              style={xrPrimaryButtonStyle}
              disabled={supportPending}
            >
              {t("AR로 캐릭터 보기", "View character in AR")}
            </button>
          ) : (
            <button type="button" onClick={onOpenMiniature} style={xrPrimaryButtonStyle}>
              {t("3D 미니어처로 보기", "View as 3D miniature")}
            </button>
          )}

          {error ? (
            <p role="alert" style={{ color: "#fda4af", fontSize: 14, marginTop: 12 }}>
              {error}
            </p>
          ) : null}

          {!arAvailable && !sessionActive ? (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>💡</span>
              <span>
                {t(
                  "이 기기·브라우저에서는 AR을 열 수 없어요. 대신 책상 위 피규어처럼 보여주는 3D 미니어처 미리보기로 같은 캐릭터를 확인할 수 있습니다.",
                  "AR can't open on this device or browser. Instead, check the same character as a 3D miniature, like a figurine on your desk.",
                )}
              </span>
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              style={{
                background: "none",
                border: "none",
                color: "rgba(226, 232, 255, 0.6)",
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              {t("AR 사용 방법이 궁금해요", "How does AR work?")}
            </button>
            {showHelp ? (
              <ol style={{ fontSize: 13, lineHeight: 1.8, color: "rgba(226,232,255,0.72)", paddingLeft: 20 }}>
                <li>{t("버튼을 누르면 카메라 권한을 요청해요.", "Tap the button to grant camera access.")}</li>
                <li>{t("바닥이나 책상을 비추면 캐릭터가 나타나요.", "Point at a floor or desk and the character appears.")}</li>
                <li>{t("손가락으로 크기를 조절하고, 두 번 탭하면 컷에 담아요.", "Pinch to resize, double-tap to capture it into a cut.")}</li>
              </ol>
            ) : null}
          </div>
        </div>
        <div style={{ flex: "0 1 320px", minWidth: 240 }}>
          {arAvailable ? (
            <XrArArt title={t("AR로 소환된 캐릭터 일러스트", "Illustration of an AR-summoned character")} />
          ) : (
            <XrEmptyArt title={t("AR 미지원 안내", "AR unsupported notice")} />
          )}
          {!arAvailable ? (
            <p style={{ fontSize: 12, color: "rgba(226,232,255,0.5)", textAlign: "center", marginTop: 8 }}>
              {t(
                `미니어처 스펙: 월드 스케일 ${miniature.worldScale}, 카메라 거리 ${miniature.cameraDistance}m`,
                `Miniature spec: world scale ${miniature.worldScale}, camera ${miniature.cameraDistance}m`,
              )}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
