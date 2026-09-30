import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  XR_VRM_EXPRESSION_PRESETS,
  XR_VRM_POSE_PRESETS,
  createXrVrmStaging,
  type XrVrmExpressionId,
  type XrVrmPoseId,
  type XrVrmStagingDescriptor,
} from "./xr-webtoon-vrm-staging";
import { XrVrmArt } from "./XrWebtoonArt";
import {
  xrCardStyle,
  xrGhostButtonStyle,
  xrNextStepStyle,
  xrPrimaryButtonStyle,
  xrSecondaryButtonStyle,
  xrSubtitleStyle,
  xrTitleStyle,
} from "./xr-webtoon-ui";

export interface XrWebtoonVrmStagingPanelProps {
  readonly cutId?: string;
  readonly onStage?: (spec: XrVrmStagingDescriptor) => void;
  readonly className?: string;
}

const POSE_ORDER: readonly XrVrmPoseId[] = ["stand", "sit", "walk", "wave", "bow", "action"];
const EXPRESSION_ORDER: readonly XrVrmExpressionId[] = ["neutral", "happy", "sad", "angry", "surprised"];

const POSE_ICONS: Record<XrVrmPoseId, string> = {
  stand: "🧍",
  sit: "🪑",
  walk: "🚶",
  wave: "👋",
  bow: "🙇",
  action: "🤸",
};

const EXPRESSION_ICONS: Record<XrVrmExpressionId, string> = {
  neutral: "😐",
  happy: "😊",
  sad: "😢",
  angry: "😠",
  surprised: "😲",
};

/**
 * VRM 캐릭터 스테이징 패널 — 포즈·표정 지정 후 컷 배치.
 *
 * 10초 룰: 포즈 카드 → 표정 카드 → "컷에 캐릭터 배치" 버튼.
 * 위치·크기·회전·반전은 <details> 고급 설정.
 */
export function XrWebtoonVrmStagingPanel({
  cutId,
  onStage,
  className,
}: XrWebtoonVrmStagingPanelProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-vrm-panel");
  const [poseId, setPoseId] = useState<XrVrmPoseId>("stand");
  const [expressionId, setExpressionId] = useState<XrVrmExpressionId>("neutral");
  const [scale, setScale] = useState(0.8);
  const [rotationYDeg, setRotationYDeg] = useState(0);
  const [mirrored, setMirrored] = useState(false);

  const descriptor = useMemo<XrVrmStagingDescriptor>(
    () =>
      createXrVrmStaging({
        poseId,
        expressionId,
        placement: { x: 0.5, y: 0.5, scale, rotationYDeg, mirrored },
      }),
    [poseId, expressionId, scale, rotationYDeg, mirrored],
  );

  const stagedSummary = t(
    `${XR_VRM_POSE_PRESETS[poseId].label.ko} · ${XR_VRM_EXPRESSION_PRESETS[expressionId].label.ko} · 크기 ${descriptor.placement.scale.toFixed(1)}x`,
    `${XR_VRM_POSE_PRESETS[poseId].label.en} · ${XR_VRM_EXPRESSION_PRESETS[expressionId].label.en} · scale ${descriptor.placement.scale.toFixed(1)}x`,
  );

  return (
    <section className={className} style={xrCardStyle} aria-labelledby="xr-vrm-title">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h2 id="xr-vrm-title" style={xrTitleStyle}>
            {t("캐릭터에 포즈와 표정을", "Pose and expression for the character")}
          </h2>
          <p style={xrSubtitleStyle}>
            {t(
              "VRM 아바타에 포즈·표정을 정하고 컷 속에 바로 세워 드립니다. 표정은 VRM 1.0과 0.x 모델 모두에 대응해요.",
              "Set a pose and expression on the VRM avatar and place it right into the cut. Expressions work on both VRM 1.0 and 0.x models.",
            )}
          </p>

          {!cutId ? (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>🧍</span>
              <span>
                {t(
                  "배치할 컷이 없어요. 먼저 컷을 만들거나 선택하면 캐릭터를 세울 수 있습니다.",
                  "No cut to stage in yet. Create or pick a cut first, then place the character.",
                )}
              </span>
            </div>
          ) : null}

          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontSize: 13, color: "rgba(226,232,255,0.6)", marginBottom: 8 }}>
              {t("포즈", "Pose")}
            </legend>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}
              role="group"
              aria-label={t("포즈 선택", "Choose pose")}
            >
              {POSE_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPoseId(id)}
                  aria-pressed={poseId === id}
                  style={{
                    ...(poseId === id ? xrSecondaryButtonStyle : xrGhostButtonStyle),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "10px 6px",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 22 }}>{POSE_ICONS[id]}</span>
                  <span style={{ fontSize: 12 }}>{t(XR_VRM_POSE_PRESETS[id].label.ko, XR_VRM_POSE_PRESETS[id].label.en)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
            <legend style={{ fontSize: 13, color: "rgba(226,232,255,0.6)", marginBottom: 8 }}>
              {t("표정", "Expression")}
            </legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={t("표정 선택", "Choose expression")}>
              {EXPRESSION_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setExpressionId(id)}
                  aria-pressed={expressionId === id}
                  style={{
                    ...(expressionId === id ? xrSecondaryButtonStyle : xrGhostButtonStyle),
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 18 }}>{EXPRESSION_ICONS[id]}</span>
                  {t(XR_VRM_EXPRESSION_PRESETS[id].label.ko, XR_VRM_EXPRESSION_PRESETS[id].label.en)}
                </button>
              ))}
            </div>
          </fieldset>

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 14, color: "rgba(226,232,255,0.75)" }}>
              {t("고급 설정 · 크기·회전·반전", "Advanced · size, turn, mirror")}
            </summary>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <label style={{ fontSize: 13, color: "rgba(226,232,255,0.65)" }}>
                {t(`크기 · ${descriptor.placement.scale.toFixed(1)}x`, `Size · ${descriptor.placement.scale.toFixed(1)}x`)}
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13, color: "rgba(226,232,255,0.65)" }}>
                {t(`회전 · ${descriptor.placement.rotationYDeg}°`, `Turn · ${descriptor.placement.rotationYDeg}°`)}
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={rotationYDeg}
                  onChange={(e) => setRotationYDeg(Number(e.target.value))}
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#e2e8ff" }}>
                <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
                {t("좌우 반전", "Mirror")}
              </label>
            </div>
          </details>

          <button
            type="button"
            onClick={() => onStage?.(descriptor)}
            style={xrPrimaryButtonStyle}
            disabled={!onStage}
          >
            {t("컷에 캐릭터 배치", "Place character in cut")}
          </button>
          <p style={{ fontSize: 12, color: "rgba(226,232,255,0.5)", marginTop: 8 }}>
            {stagedSummary}
          </p>
          {!onStage ? (
            <p style={{ fontSize: 12, color: "rgba(226,232,255,0.5)", marginTop: 4 }}>
              {t("배치 핸들러가 연결되면 활성화됩니다.", "Enabled once a staging handler is connected.")}
            </p>
          ) : null}
        </div>
        <div style={{ flex: "0 1 300px", minWidth: 220 }}>
          <XrVrmArt title={t("VRM 스테이징 일러스트", "VRM staging illustration")} />
        </div>
      </div>
    </section>
  );
}
