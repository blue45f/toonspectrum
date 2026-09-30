import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import { XrWebtoonArPreviewPanel } from "./XrWebtoonArPreviewPanel";
import { XrWebtoonCutCapturePanel } from "./XrWebtoonCutCapturePanel";
import { XrWebtoonDepthViewer } from "./XrWebtoonDepthViewer";
import { XrWebtoonVrmStagingPanel } from "./XrWebtoonVrmStagingPanel";
import { XrWebtoonVrTheaterPanel } from "./XrWebtoonVrTheaterPanel";
import type { XrCutCaptureJob } from "./xr-webtoon-cut-capture";
import type { XrVrmStagingDescriptor } from "./xr-webtoon-vrm-staging";
import { xrCardStyle } from "./xr-webtoon-ui";
import type { XrDepthCut } from "./xr-webtoon-depth-model";

export interface XrWebtoonStudioPanelProps {
  /** 깊이 뷰어용 컷 목록 (배경/인물/전경 레이어 포함). */
  readonly cuts: readonly XrDepthCut[];
  readonly support: StudioWebXrSupportSnapshot | null;
  readonly supportPending?: boolean;
  readonly onStartAr: () => void;
  readonly onStartVr: () => void;
  readonly onEndSession: () => void;
  readonly sessionActive?: boolean;
  readonly sessionError?: string | null;
  readonly onCutCapture?: (job: XrCutCaptureJob) => void;
  readonly onVrmStage?: (spec: XrVrmStagingDescriptor) => void;
  readonly sceneName?: string;
  readonly className?: string;
}

type XrTab = "depth" | "ar" | "vr" | "cut" | "vrm";

/**
 * XR 웹툰 스튜디오 허브 — 5가지 XR 기능을 한 화면에서.
 *
 * 탭은 role=tablist 키보드 탐색을 지원하고, 각 패널이 자신의 CTA를 가진다.
 */
export function XrWebtoonStudioPanel({
  cuts,
  support,
  supportPending = false,
  onStartAr,
  onStartVr,
  onEndSession,
  sessionActive = false,
  sessionError = null,
  onCutCapture,
  onVrmStage,
  sceneName,
  className,
}: XrWebtoonStudioPanelProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-studio");
  const [tab, setTab] = useState<XrTab>("depth");

  const tabs: readonly { id: XrTab; ko: string; en: string; icon: string }[] = [
    { id: "depth", ko: "깊이 웹툰", en: "Depth", icon: "🌀" },
    { id: "ar", ko: "AR 프리뷰", en: "AR", icon: "📱" },
    { id: "vr", ko: "VR 시어터", en: "VR", icon: "🥽" },
    { id: "cut", ko: "3D→컷", en: "Cut", icon: "🎬" },
    { id: "vrm", ko: "VRM 배치", en: "VRM", icon: "🧍" },
  ];

  return (
    <section className={className} aria-labelledby="xr-studio-title">
      <div style={{ ...xrCardStyle, marginBottom: 16, padding: "20px 24px" }}>
        <h1 id="xr-studio-title" style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>
          {t("XR 웹툰 스튜디오", "XR Webtoon Studio")}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(226,232,255,0.65)", margin: "6px 0 0" }}>
          {t(
            "웹툰을 입체로 읽고, AR·VR로 감상하고, 3D로 컷을 만드세요. 기기가 XR을 지원하지 않아도 모든 기능은 2D로 미리 볼 수 있어요.",
            "Read webtoons in depth, watch in AR and VR, render cuts from 3D. Every feature previews in 2D even without XR hardware.",
          )}
        </p>
      </div>

      <div
        role="tablist"
        aria-label={t("XR 기능 선택", "Choose XR feature")}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`xr-tabpanel-${item.id}`}
              id={`xr-tab-${item.id}`}
              onClick={() => setTab(item.id)}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                border: active ? "1px solid #22d3ee" : "1px solid rgba(139,92,246,0.3)",
                background: active
                  ? "linear-gradient(135deg, rgba(34,211,238,0.25), rgba(139,92,246,0.25))"
                  : "rgba(15,23,42,0.6)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span aria-hidden>{item.icon}</span>
              {t(item.ko, item.en)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`xr-tabpanel-${tab}`}
        aria-labelledby={`xr-tab-${tab}`}
      >
        {tab === "depth" ? (
          <XrWebtoonDepthViewer cuts={cuts} />
        ) : tab === "ar" ? (
          <XrWebtoonArPreviewPanel
            support={support}
            supportPending={supportPending}
            sessionActive={sessionActive}
            error={sessionError}
            onStartAr={onStartAr}
            onEndAr={onEndSession}
          />
        ) : tab === "vr" ? (
          <XrWebtoonVrTheaterPanel
            cutCount={cuts.length}
            support={support}
            supportPending={supportPending}
            sessionActive={sessionActive}
            error={sessionError}
            onStartVr={onStartVr}
            onEndVr={onEndSession}
          />
        ) : tab === "cut" ? (
          <XrWebtoonCutCapturePanel sceneName={sceneName} onCapture={onCutCapture} />
        ) : (
          <XrWebtoonVrmStagingPanel
            cutId={cuts[0]?.id}
            onStage={onVrmStage}
          />
        )}
      </div>
    </section>
  );
}
