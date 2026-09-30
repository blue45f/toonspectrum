import { useId, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  XR_CUT_ASPECTS,
  XR_CUT_CAMERA_PRESETS,
  XR_CUT_LONG_EDGE_MAX_PX,
  XR_CUT_LONG_EDGE_MIN_PX,
  createXrCutCaptureJob,
  xrCutCaptureFilename,
  type XrCutAspectId,
  type XrCutCameraPresetId,
  type XrCutCaptureJob,
  type XrCutScreentone,
} from "./xr-webtoon-cut-capture";
import { XrCutArt } from "./XrWebtoonArt";
import {
  xrCardStyle,
  xrGhostButtonStyle,
  xrNextStepStyle,
  xrPrimaryButtonStyle,
  xrSecondaryButtonStyle,
  xrSubtitleStyle,
  xrTitleStyle,
} from "./xr-webtoon-ui";

export interface XrWebtoonCutCapturePanelProps {
  /** 캡처 소스가 되는 3D 장면 이름 (없으면 빈 상태). */
  readonly sceneName?: string;
  readonly onCapture?: (job: XrCutCaptureJob) => void;
  readonly className?: string;
}

const ASPECT_ORDER: readonly XrCutAspectId[] = ["cut-1-1", "cut-3-4", "cut-4-5", "cut-9-16", "cut-16-9"];
const LONG_EDGE_OPTIONS = [480, 800, 1080, 1600, 2048] as const;

const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: 6,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(15,23,42,0.8)",
  color: "#e2e8ff",
  border: "1px solid rgba(139,92,246,0.35)",
};

/**
 * 3D 배경 → 웹툰 컷 렌더 패널.
 *
 * 10초 룰: 화면비 선택 + "웹툰 컷으로 만들기" 버튼 하나.
 * 툰 셰이딩·윤곽·스크린톤은 <details> 고급 설정. 실제 렌더는 onCapture로 위임
 * (StudioBg3dCaptureBridge 어댑터와 연결 가능).
 */
export function XrWebtoonCutCapturePanel({
  sceneName,
  onCapture,
  className,
}: XrWebtoonCutCapturePanelProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-cut-panel");
  const jobId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [aspectId, setAspectId] = useState<XrCutAspectId>("cut-4-5");
  const [cameraPresetId, setCameraPresetId] = useState<XrCutCameraPresetId>("eye-level");
  const [longEdgePx, setLongEdgePx] = useState<number>(800);
  const [toonShading, setToonShading] = useState(true);
  const [outline, setOutline] = useState(0.5);
  const [screentone, setScreentone] = useState<XrCutScreentone>("dots");
  const [halftone, setHalftone] = useState(false);

  const job = useMemo<XrCutCaptureJob>(
    () =>
      createXrCutCaptureJob({
        jobId: `xr-cut-${jobId}`,
        aspectId,
        longEdgePx,
        camera: XR_CUT_CAMERA_PRESETS[cameraPresetId],
        style: { toonShading, outline, screentone, halftone },
      }),
    [jobId, aspectId, longEdgePx, cameraPresetId, toonShading, outline, screentone, halftone],
  );
  const fileName = xrCutCaptureFilename(job);

  const cameraLabel: Record<XrCutCameraPresetId, string> = {
    "eye-level": t("눈높이", "Eye-level"),
    "low-angle": t("로우앵글", "Low-angle"),
    "high-angle": t("하이앵글", "High-angle"),
    "close-up": t("클로즈업", "Close-up"),
  };

  const screentoneLabel: Record<XrCutScreentone, string> = {
    none: t("없음", "None"),
    dots: t("도트", "Dots"),
    lines: t("선", "Lines"),
  };

  return (
    <section className={className} style={xrCardStyle} aria-labelledby="xr-cut-title">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h2 id="xr-cut-title" style={xrTitleStyle}>
            {t("3D 배경을 웹툰 컷으로", "Turn a 3D set into a webtoon cut")}
          </h2>
          <p style={xrSubtitleStyle}>
            {t(
              "구도·화면비를 고르고 버튼 하나로 렌더합니다. 툰 셰이딩·윤곽선·스크린톤이 자동으로 입혀져요.",
              "Pick a shot and aspect ratio, render with one button. Toon shading, outlines and screentone are applied automatically.",
            )}
          </p>

          {sceneName ? (
            <p style={{ fontSize: 13, color: "rgba(226,232,255,0.65)", margin: "0 0 12px" }}>
              {t(`장면: ${sceneName}`, `Scene: ${sceneName}`)}
            </p>
          ) : (
            <div style={xrNextStepStyle} role="note">
              <span aria-hidden style={{ fontSize: 20 }}>🏙️</span>
              <span>
                {t(
                  "3D 장면이 아직 없어요. 배경 편집기에서 장면을 만들면 여기서 웹툰 컷으로 렌더할 수 있습니다.",
                  "No 3D scene yet. Build a set in the background editor, then render it into webtoon cuts here.",
                )}
              </span>
            </div>
          )}

          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontSize: 13, color: "rgba(226,232,255,0.6)", marginBottom: 8 }}>
              {t("화면비", "Aspect ratio")}
            </legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={t("화면비 선택", "Choose aspect ratio")}>
              {ASPECT_ORDER.map((id) => {
                const aspect = XR_CUT_ASPECTS[id];
                const active = aspectId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAspectId(id)}
                    aria-pressed={active}
                    title={t(aspect.label.ko, aspect.label.en)}
                    style={{
                      ...(active ? xrSecondaryButtonStyle : xrGhostButtonStyle),
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: Math.max(6, Math.round((14 * aspect.heightRatio) / aspect.widthRatio)),
                        maxHeight: 22,
                        border: "2px solid currentColor",
                        borderRadius: 2,
                      }}
                    />
                    {aspect.widthRatio}:{aspect.heightRatio}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label style={{ display: "block", fontSize: 13, color: "rgba(226,232,255,0.6)", marginBottom: 12 }}>
            {t("카메라 구도", "Camera shot")}
            <select
              value={cameraPresetId}
              onChange={(e) => setCameraPresetId(e.target.value as XrCutCameraPresetId)}
              style={selectStyle}
            >
              {(Object.keys(XR_CUT_CAMERA_PRESETS) as XrCutCameraPresetId[]).map((id) => (
                <option key={id} value={id}>
                  {cameraLabel[id]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", fontSize: 13, color: "rgba(226,232,255,0.6)", marginBottom: 16 }}>
            {t("출력 해상도 (긴 변)", `Output size (long edge)`)}
            <select
              value={String(longEdgePx)}
              onChange={(e) => setLongEdgePx(Number(e.target.value))}
              style={selectStyle}
            >
              {LONG_EDGE_OPTIONS.map((w) => (
                <option key={w} value={String(w)}>
                  {w}px
                </option>
              ))}
            </select>
          </label>

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 14, color: "rgba(226,232,255,0.75)" }}>
              {t("고급 설정 · 툰 스타일", "Advanced · toon style")}
            </summary>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#e2e8ff" }}>
                <input type="checkbox" checked={toonShading} onChange={(e) => setToonShading(e.target.checked)} />
                {t("툰 셰이딩", "Toon shading")}
              </label>
              <label style={{ fontSize: 13, color: "rgba(226,232,255,0.65)" }}>
                {t(`외곽선 강도 · ${Math.round(outline * 100)}%`, `Outline strength · ${Math.round(outline * 100)}%`)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={outline}
                  onChange={(e) => setOutline(Number(e.target.value))}
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13, color: "rgba(226,232,255,0.65)" }}>
                {t("스크린톤", "Screentone")}
                <select
                  value={screentone}
                  onChange={(e) => setScreentone(e.target.value as XrCutScreentone)}
                  style={selectStyle}
                >
                  {(["none", "dots", "lines"] as const).map((s) => (
                    <option key={s} value={s}>{screentoneLabel[s]}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#e2e8ff" }}>
                <input type="checkbox" checked={halftone} onChange={(e) => setHalftone(e.target.checked)} />
                {t("하프톤 그라데이션", "Halftone gradient")}
              </label>
            </div>
          </details>

          <button
            type="button"
            onClick={() => onCapture?.(job)}
            style={xrPrimaryButtonStyle}
            disabled={!onCapture}
          >
            {t("웹툰 컷으로 만들기", "Render webtoon cut")}
          </button>
          <p style={{ fontSize: 12, color: "rgba(226,232,255,0.5)", marginTop: 10 }}>
            {t(
              `출력: ${job.widthPx}×${job.heightPx}px · ${fileName} · ${XR_CUT_LONG_EDGE_MIN_PX}~${XR_CUT_LONG_EDGE_MAX_PX}px 지원`,
              `Output: ${job.widthPx}×${job.heightPx}px · ${fileName} · supports ${XR_CUT_LONG_EDGE_MIN_PX}–${XR_CUT_LONG_EDGE_MAX_PX}px`,
            )}
          </p>
        </div>
        <div style={{ flex: "0 1 300px", minWidth: 220 }}>
          <XrCutArt title={t("컷 렌더 일러스트", "Cut render illustration")} />
        </div>
      </div>
    </section>
  );
}
