import {
  CheckSquare,
  Cpu,
  Download,
  Layers,
  Loader2,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import React, { useMemo, useState } from "react";

import {
  MULTIPASS_CONFIG_KEY_BY_KIND,
  WEBTOON_RENDER_PASSES,
  applyMultiPassExportPreset,
  planMultiPassExport,
  type MultiPassBooleanConfigKey,
  type MultiPassExportConfig,
  type MultiPassExportPreset,
} from "../scene-3d/studio-3d-webtoon-multipass-exporter";
import {
  buildBg3dMultiPassPsd,
  composeBg3dMultiPassLayers,
  multiPassPsdResultMessage,
  type Bg3dMultiPassPsdCharacterPass,
  type Bg3dMultiPassPsdLayerId,
  type Bg3dMultiPassPsdScenePasses,
  type ComposeBg3dMultiPassPsdResult,
} from "./studio-bg3d-multipass-psd";
import {
  StudioBg3dMultiPassPsdPreview,
  type MultiPassPsdExportProgress,
  type MultiPassPsdNotice,
} from "./StudioBg3dMultiPassPsdPreview";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const PRESET_LABELS: Readonly<Record<MultiPassExportPreset, string>> = Object.freeze({
  manuscript: "원고 기본",
  "ai-control": "AI 제어맵",
  compositing: "합성/VFX",
  complete: "전체 패스",
});

const ROLE_LABELS = Object.freeze({
  manuscript: "원고",
  mask: "선택/제어",
  relight: "재조명",
  motion: "모션",
} as const);

type ActiveMultiPassPreset = MultiPassExportPreset | "custom";

export interface StudioBg3dMultiPassExporterPanelProps {
  readonly disabled?: boolean;
  readonly onStartMultiPassExport?: (config: MultiPassExportConfig) => void;
  /**
   * PSD 플로우용 분리 패스 소스. 제공되면 format이 "psd"일 때 시작 버튼이
   * 패스 준비 → 미리보기(레이어 토글) → PSD 저장 흐름을 직접 수행한다.
   * 없으면 기존처럼 onStartMultiPassExport만 호출한다.
   */
  readonly resolveMultiPassPsdPasses?: (
    config: MultiPassExportConfig,
  ) => Promise<StudioBg3dMultiPassPsdPassSource | null>;
}

/** resolveMultiPassPsdPasses가 돌려주는 분리 렌더 패스 묶음. */
export interface StudioBg3dMultiPassPsdPassSource {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly scene: Bg3dMultiPassPsdScenePasses;
  /** 캐릭터+배경 합성본용 — 같은 파이프라인으로 합성된다. */
  readonly characterPasses?: readonly Bg3dMultiPassPsdCharacterPass[];
}

type PsdFlowPhase = "idle" | "resolving" | "preview" | "exporting";

function safeFileStem(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return cleaned.length > 0 ? cleaned.slice(0, 48) : "bg3d-multipass";
}

function downloadBlob(blob: Blob, fileName: string): boolean {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof document === "undefined"
  ) {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function StudioBg3dMultiPassExporterPanel({
  disabled = false,
  onStartMultiPassExport,
  resolveMultiPassPsdPasses,
}: StudioBg3dMultiPassExporterPanelProps): React.JSX.Element {
  const [config, setConfig] = useState<MultiPassExportConfig>({
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    transparentBackground: true,
    includeLineArt: true,
    includeFlatColor: true,
    includeShadow: true,
    includeHighlight: true,
    includeDepthMap: false,
    includeObjectIdMask: true,
    includeNormalMap: false,
    includeMaterialIdMask: false,
    includeAmbientOcclusion: false,
    includeEmission: false,
    includeVelocity: false,
    includeBackground: false,
    format: "png-zip",
  });
  const [activePreset, setActivePreset] = useState<ActiveMultiPassPreset>("manuscript");
  const copy = useBilingual("scene3d-multipass-psd-output");
  const planned = useMemo(() => planMultiPassExport(config), [config]);
  const psdOutputBlocked =
    (config.format === "psd" || config.format === "clip-studio-layers") && planned.psdBlocked;

  const [psdPhase, setPsdPhase] = useState<PsdFlowPhase>("idle");
  const [psdComposed, setPsdComposed] = useState<ComposeBg3dMultiPassPsdResult | null>(null);
  const [psdTitle, setPsdTitle] = useState("");
  const [psdVisibleLayerIds, setPsdVisibleLayerIds] = useState<ReadonlySet<Bg3dMultiPassPsdLayerId>>(new Set());
  const [psdProgress, setPsdProgress] = useState<MultiPassPsdExportProgress | null>(null);
  const [psdNotice, setPsdNotice] = useState<MultiPassPsdNotice | null>(null);
  const psdFlowToken = React.useRef(0);
  const psdFlowActive = psdPhase !== "idle";

  const togglePass = (key: MultiPassBooleanConfigKey) => {
    setActivePreset("custom");
    setConfig((current) => ({ ...current, [key]: !current[key] }));
  };

  const applyPreset = (preset: MultiPassExportPreset) => {
    setActivePreset(preset);
    setConfig((current) => applyMultiPassExportPreset(current, preset));
  };

  const closePsdPreview = () => {
    psdFlowToken.current += 1;
    setPsdPhase("idle");
    setPsdComposed(null);
    setPsdProgress(null);
  };

  const togglePsdPreviewLayer = (id: Bg3dMultiPassPsdLayerId) => {
    setPsdVisibleLayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPsdFlow = () => {
    if (!resolveMultiPassPsdPasses || psdFlowActive) return;
    const token = psdFlowToken.current + 1;
    psdFlowToken.current = token;
    setPsdNotice(null);
    setPsdPhase("resolving");
    setPsdProgress({ label: "분리 패스 준비 중", completed: 0, total: 3 });
    void (async () => {
      try {
        const source = await resolveMultiPassPsdPasses(config);
        if (psdFlowToken.current !== token) return;
        if (!source) {
          setPsdNotice({ tone: "info", text: "패스 소스가 없어 PSD 미리보기를 열 수 없습니다." });
          setPsdPhase("idle");
          setPsdProgress(null);
          return;
        }
        setPsdProgress({ label: "선화·음영·밑색·배경 합성 중", completed: 1, total: 3 });
        const composed = composeBg3dMultiPassLayers({
          width: source.width,
          height: source.height,
          scene: source.scene,
          characterPasses: source.characterPasses,
        });
        if (psdFlowToken.current !== token) return;
        setPsdComposed(composed);
        setPsdTitle(source.title);
        setPsdVisibleLayerIds(new Set(composed.layers.map((layer) => layer.id)));
        setPsdProgress(null);
        setPsdPhase("preview");
      } catch (error) {
        if (psdFlowToken.current !== token) return;
        setPsdNotice({
          tone: "bad",
          text: "분리 패스를 준비하지 못했습니다.",
          detail: error instanceof Error ? error.message : undefined,
        });
        setPsdPhase("idle");
        setPsdProgress(null);
      }
    })();
  };

  const exportPsdFile = () => {
    const composed = psdComposed;
    if (!composed || psdPhase === "exporting") return;
    const token = psdFlowToken.current;
    setPsdPhase("exporting");
    setPsdProgress({ label: "PSD 파일 만드는 중", completed: 2, total: 3 });
    setPsdNotice(null);
    void (async () => {
      try {
        // 미리보기와 같은 합성 결과를 인코딩한다 — 화면과 파일이 달라지지 않는다.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        if (psdFlowToken.current !== token) return;
        const hiddenLayerIds = new Set(
          composed.layers.map((layer) => layer.id).filter((id) => !psdVisibleLayerIds.has(id)),
        );
        const result = buildBg3dMultiPassPsd({
          title: psdTitle,
          width: composed.width,
          height: composed.height,
          layers: composed.layers,
          skipped: composed.skipped,
          hiddenLayerIds,
          includedCharacter: composed.includedCharacter,
        });
        if (psdFlowToken.current !== token) return;
        if (!downloadBlob(result.blob, `${safeFileStem(psdTitle)}-multipass.psd`)) {
          throw new Error("이 브라우저에서는 파일을 내려받을 수 없습니다.");
        }
        setPsdProgress({ label: "완료", completed: 3, total: 3 });
        const skippedDetail = result.receipt.skipped.length > 0
          ? result.receipt.skipped.map((entry) => entry.reason).join(" · ")
          : undefined;
        setPsdNotice({
          tone: skippedDetail ? "info" : "good",
          text: multiPassPsdResultMessage(result.receipt),
          detail: skippedDetail,
        });
        setPsdPhase("preview");
      } catch (error) {
        if (psdFlowToken.current !== token) return;
        setPsdNotice({
          tone: "bad",
          text: "PSD를 저장하지 못했습니다.",
          detail: error instanceof Error ? error.message : undefined,
        });
        setPsdPhase("preview");
        setPsdProgress(null);
      }
    })();
  };

  const handleStart = () => {
    // PSD 플로우가 연결된 독립 실행 패널에서는 미리보기→저장 흐름을 직접 수행한다.
    if (config.format === "psd" && resolveMultiPassPsdPasses) {
      startPsdFlow();
      return;
    }
    onStartMultiPassExport?.(config);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Layers className="size-4 text-accent" />
          <span>멀티패스 레이어 자동 분리 내보내기</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold text-accent">
            {planned.totalPasses}개 패스
          </span>
          <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.58rem] text-fg-3">
            {planned.captureProfile.toUpperCase()}
          </span>
        </div>
      </div>

      <section className="grid gap-2 rounded-lg border border-line bg-card p-2.5" aria-label="멀티패스 빠른 프리셋">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
            <Sparkles className="size-3.5 text-accent" />
            작업 목적 프리셋
          </span>
          {activePreset === "custom" ? (
            <span className="rounded bg-raised px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg-3">
              사용자 설정
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(PRESET_LABELS) as MultiPassExportPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset)}
              className={`min-h-8 rounded border px-1.5 text-[0.6rem] font-bold transition-colors disabled:opacity-45 ${
                activePreset === preset
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-raised text-fg-2 hover:text-fg"
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-1.5" aria-label="추출할 웹툰 렌더 패스 선택">
        <span className="text-[0.68rem] font-medium text-fg-3">추출할 웹툰 렌더 패스 선택</span>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {WEBTOON_RENDER_PASSES.map((pass) => {
            const configKey = MULTIPASS_CONFIG_KEY_BY_KIND[pass.kind];
            const isChecked = Boolean(config[configKey]);
            return (
              <button
                key={pass.kind}
                type="button"
                disabled={disabled}
                aria-pressed={isChecked}
                onClick={() => togglePass(configKey)}
                className={`flex min-h-16 items-start gap-2 rounded-lg border p-2 text-left transition-all disabled:opacity-45 ${
                  isChecked
                    ? "border-accent/80 bg-accent/5 text-fg"
                    : "border-line bg-card text-fg-3 opacity-65 hover:opacity-100"
                }`}
              >
                {isChecked ? (
                  <CheckSquare className="mt-0.5 size-4 shrink-0 text-accent" />
                ) : (
                  <Square className="mt-0.5 size-4 shrink-0 text-fg-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1">
                    <strong className="text-[0.68rem]">{pass.layerName}</strong>
                    <span className="rounded bg-raised px-1 py-0.5 font-mono text-[0.5rem] text-fg-2">
                      {pass.blendMode.toUpperCase()}
                    </span>
                    <span className={`rounded px-1 py-0.5 font-mono text-[0.5rem] ${
                      pass.source === "artifact-v2"
                        ? "bg-cool/10 text-cool"
                        : "bg-accent/10 text-accent"
                    }`}>
                      {pass.source === "artifact-v2" ? "ARTIFACT V2" : "LT"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.57rem] leading-relaxed text-fg-3">
                    {pass.description}
                  </span>
                  <span className="mt-1 flex gap-2 font-mono text-[0.5rem] text-fg-3">
                    <span>{pass.pixelFormat}</span>
                    <span>{pass.bytesPerPixel}B/px</span>
                    <span>{ROLE_LABELS[pass.productionRole]}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-2 rounded-lg border border-line bg-card p-2.5" aria-label="멀티패스 내보내기 규격">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.68rem] font-semibold text-fg-2">해상도</span>
          <div className="flex flex-wrap gap-1">
            {[
              { label: "세로 원고", width: 1440, height: 2560 },
              { label: "FHD", width: 1920, height: 1080 },
              { label: "4K", width: 3840, height: 2160 },
            ].map((resolution) => (
              <button
                key={resolution.label}
                type="button"
                disabled={disabled}
                onClick={() => setConfig((current) => ({
                  ...current,
                  resolutionWidth: resolution.width,
                  resolutionHeight: resolution.height,
                }))}
                className={`min-h-7 rounded px-1.5 text-[0.58rem] font-bold disabled:opacity-45 ${
                  config.resolutionWidth === resolution.width && config.resolutionHeight === resolution.height
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {resolution.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[0.58rem] font-semibold text-fg-3">
            너비 px
            <input
              type="number"
              min="1"
              max="16384"
              value={config.resolutionWidth}
              disabled={disabled}
              onChange={(event) => setConfig((current) => ({
                ...current,
                resolutionWidth: Number(event.target.value),
              }))}
              className="mt-1 min-h-8 w-full rounded border border-line bg-raised px-2 text-fg"
            />
          </label>
          <label className="text-[0.58rem] font-semibold text-fg-3">
            높이 px
            <input
              type="number"
              min="1"
              max="16384"
              value={config.resolutionHeight}
              disabled={disabled}
              onChange={(event) => setConfig((current) => ({
                ...current,
                resolutionHeight: Number(event.target.value),
              }))}
              className="mt-1 min-h-8 w-full rounded border border-line bg-raised px-2 text-fg"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2">
          <label className="flex min-h-8 items-center gap-2 text-[0.62rem] font-semibold text-fg-2">
            <input
              type="checkbox"
              checked={config.transparentBackground}
              disabled={disabled}
              onChange={(event) => setConfig((current) => ({
                ...current,
                transparentBackground: event.target.checked,
              }))}
              className="size-3.5 accent-accent"
            />
            투명 배경
          </label>
          <div className="flex gap-1">
            {(["png-zip", "psd", "clip-studio-layers"] as const).map((format) => (
              <button
                key={format}
                type="button"
                disabled={disabled}
                onClick={() => setConfig((current) => ({ ...current, format }))}
                className={`min-h-7 rounded px-1.5 font-mono text-[0.58rem] uppercase disabled:opacity-45 ${
                  config.format === format
                    ? "bg-accent font-bold text-on-accent"
                    : "border border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {format === "png-zip" ? "ZIP(PNG)" : format === "psd" ? "PSD" : "CLIP"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-1 rounded-lg border border-line bg-raised/60 p-2.5" aria-label="멀티패스 예산">
        <div className="flex items-center justify-between gap-2 text-[0.62rem]">
          <span className="flex items-center gap-1 font-semibold text-fg-2">
            <Cpu className="size-3.5 text-accent" />
            실행 계획
          </span>
          <span className="font-mono text-fg-3">
            {planned.recommendedExecution === "worker" ? "Worker 순차 렌더" : "즉시 렌더 가능"}
          </span>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.58rem] text-fg-3">
          <dt>예상 다운로드</dt>
          <dd className="numeral text-right text-fg-2">~{planned.estimatedFileSizeMb}MB</dd>
          <dt>예상 작업 메모리</dt>
          <dd className="numeral text-right text-fg-2">~{planned.estimatedWorkingSetMb}MB</dd>
          <dt>출력 규격</dt>
          <dd className="numeral text-right text-fg-2">{planned.exportResolution[0]} × {planned.exportResolution[1]}</dd>
        </dl>
        {planned.warnings.map((warning) => (
          <p key={warning} className="flex gap-1 text-[0.56rem] leading-relaxed text-warn" role="status">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            {warning}
          </p>
        ))}
      </section>

      {psdFlowActive && psdComposed ? (
        <StudioBg3dMultiPassPsdPreview
          title={psdTitle}
          width={psdComposed.width}
          height={psdComposed.height}
          layers={psdComposed.layers}
          visibleLayerIds={psdVisibleLayerIds}
          skipped={psdComposed.skipped}
          includedCharacter={psdComposed.includedCharacter}
          progress={psdProgress}
          exporting={psdPhase === "exporting"}
          notice={psdNotice}
          disabled={disabled}
          onToggleLayer={togglePsdPreviewLayer}
          onExport={exportPsdFile}
          onClose={closePsdPreview}
        />
      ) : null}
      {psdPhase === "resolving" ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2" role="status" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
          <span className="text-[0.62rem] text-fg-3">{psdProgress?.label ?? "분리 패스 준비 중"}</span>
        </div>
      ) : null}
      {!psdFlowActive && psdNotice ? (
        <p
          role="status"
          title={psdNotice.detail}
          className={`rounded-lg border px-2.5 py-2 text-[0.6rem] leading-relaxed ${
            psdNotice.tone === "bad"
              ? "border-bad/40 bg-bad/10 text-bad"
              : psdNotice.tone === "good"
                ? "border-good/40 bg-good/10 text-good"
                : "border-line bg-panel text-fg-2"
          }`}
        >
          {psdNotice.text}
          {psdNotice.detail ? <span className="mt-0.5 block font-normal text-fg-3">{psdNotice.detail}</span> : null}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled || planned.totalPasses === 0 || psdOutputBlocked || psdPhase === "resolving"}
        onClick={handleStart}
        className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.68rem] font-bold text-on-accent shadow-sm transition-all hover:bg-accent/90 disabled:opacity-45"
      >
        {psdPhase === "resolving" ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Download className="size-3.5" aria-hidden />
        )}
        <span>
          {config.format === "psd" && resolveMultiPassPsdPasses
            ? "분리 패스 미리보기 & PSD 저장"
            : "레이어별 패스 렌더링 & 다운로드 시작"}
        </span>
      </button>
      {psdOutputBlocked ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-bad/45 bg-bad/10 p-2.5 text-bad">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="grid gap-1.5">
            <p className="text-[0.62rem] font-semibold leading-relaxed">
              {copy(
                "레이어 PSD 제한을 초과했습니다. 레이어 PSD는 캔버스 2,097,152px·최대 4레이어·합계 8,388,608px까지 지원합니다. 큰 타일 PSD는 지원하지 않습니다.",
                "Layered PSD limits exceeded. Layered PSD supports a 2,097,152-pixel canvas, up to 4 layers and 8,388,608 aggregate layer pixels. Large tiled PSD is unsupported.",
              )}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setConfig((current) => ({ ...current, format: "png-zip" }))}
              className="min-h-8 w-fit rounded border border-line bg-card px-2 text-[0.6rem] font-bold text-fg transition-colors hover:text-fg-2 disabled:opacity-45"
            >
              {copy("분리 PNG 패스로 전환", "Switch to separate PNG passes")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
