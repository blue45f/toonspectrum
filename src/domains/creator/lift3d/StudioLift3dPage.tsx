import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { StudioPanelLoading } from "../StudioLazySurfaceFallback";

import {
  STUDIO_LIFT3D_LIMITS,
  STUDIO_LIFT3D_SUBJECTS,
  type StudioLift3dSubject,
  type StudioLift3dWarning,
} from "./studio-lift3d-contract";
import {
  STUDIO_LIFT3D_ACCEPTED_MIME_TYPES,
  StudioLift3dDecodeError,
  decodeStudioLift3dFile,
  type StudioLift3dDecodedFile,
} from "./studio-lift3d-image-decode";
import {
  STUDIO_LIFT3D_PRESETS,
  liftStudioImageTo3dGlb,
  type StudioLift3dExport,
} from "./studio-lift3d-pipeline";
import {
  paintStudioLift3dDepthPreview,
  paintStudioLift3dMaskPreview,
} from "./studio-lift3d-preview-raster";
import { buildStudioLift3dRenderBuffers } from "./studio-lift3d-render-buffers";

import { lazyRetry } from "@/lib/lazy-retry";
import Link from "@/src/compat/router-link";
import { useDocumentTitle } from "@/src/hooks/use-document-title";

const StudioLift3dPreview = lazyRetry(
  () => import("./StudioLift3dPreview").then((module) => ({
    default: module.StudioLift3dPreview,
  })),
  "StudioLift3dPreview",
);

const PREVIEW_TABS = ["source", "mask", "depth", "model"] as const;
type StudioLift3dPreviewTab = (typeof PREVIEW_TABS)[number];

const PREVIEW_TAB_LABELS: Readonly<Record<StudioLift3dPreviewTab, string>> = {
  source: "원화",
  mask: "실루엣",
  depth: "깊이",
  model: "3D",
};

const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm " +
  "font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";
const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm " +
  "font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";
const FIELD_LABEL_CLASS = "flex items-center justify-between text-xs font-semibold text-fg-2";
const CARD_CLASS = "rounded-xl border border-line bg-card/60 p-4";

interface SliderFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly display: string;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
}: SliderFieldProps) {
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <label className={FIELD_LABEL_CLASS} htmlFor={inputId}>
        <span>{label}</span>
        <span className="font-mono text-fg-3">{display}</span>
      </label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent disabled:opacity-40"
      />
    </div>
  );
}

function WarningList({ warnings }: { readonly warnings: readonly StudioLift3dWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-xs leading-relaxed text-fg-3">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`} className="flex gap-2">
          <span aria-hidden="true">·</span>
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** 마스크·깊이 미리보기를 작업 격자 해상도 그대로 그린다(확대는 CSS 가 픽셀 단위로). */
function RasterPreview({
  width,
  height,
  pixels,
  label,
}: {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
  }, [width, height, pixels]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-full w-full object-contain [image-rendering:pixelated]"
    />
  );
}

export interface StudioLift3dPageProps {
  /** 주소의 `?subject=` 프리셋. 알 수 없는 값은 라우터가 이미 떨어뜨린다. */
  readonly initialSubject?: string | null;
}

/**
 * 2D 원화를 3D 모델로 들어올리는 작업대.
 *
 * 편집 문서와 독립된 도구 화면이다. 변환은 전부 이 기기 안에서 끝나고(업로드도, 외부 추론
 * 서비스 호출도 없다), 결과는 이 앱 자신의 모델 가져오기 게이트를 통과하는 GLB 로 나간다 —
 * 그래서 바로 배경 3D 씬에 가져다 쓸 수 있다.
 */
export function StudioLift3dPage({ initialSubject = null }: StudioLift3dPageProps) {
  useDocumentTitle("2D → 3D 변환 · Studio");
  const navigate = useNavigate();
  const subjectGroupName = useId();

  const [subject, setSubject] = useState<StudioLift3dSubject>(
    (STUDIO_LIFT3D_SUBJECTS as readonly string[]).includes(initialSubject ?? "")
      ? initialSubject as StudioLift3dSubject
      : "character",
  );
  const preset = STUDIO_LIFT3D_PRESETS[subject];

  const [decoded, setDecoded] = useState<StudioLift3dDecodedFile | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [resolution, setResolution] = useState(preset.resolution);
  const [depthScale, setDepthScale] = useState(preset.depthScale);
  const [smoothing, setSmoothing] = useState(preset.smoothing);
  const [unlit, setUnlit] = useState(true);
  const [invertRelief, setInvertRelief] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<StudioLift3dPreviewTab>("source");
  const [result, setResult] = useState<StudioLift3dExport | null>(null);
  const [warnings, setWarnings] = useState<readonly StudioLift3dWarning[]>([]);
  const [liftError, setLiftError] = useState<string | null>(null);

  // 미리보기 URL 은 텍스처 한도와 무관하게 원본 바이트에서 만든다. 16MB 를 넘어 GLB 에
  // 싣지 못하는 그림이라도 화면에서는 그대로 보여줘야 한다.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  useEffect(() => {
    if (decoded === null) {
      setSourceUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([decoded.bytes as BlobPart], { type: decoded.mimeType }),
    );
    setSourceUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [decoded]);

  /** 프리셋을 바꾸면 손대지 않은 수치는 그 프리셋의 기본값으로 되돌린다. */
  const selectSubject = useCallback((next: StudioLift3dSubject) => {
    const nextPreset = STUDIO_LIFT3D_PRESETS[next];
    setSubject(next);
    setResolution(nextPreset.resolution);
    setDepthScale(nextPreset.depthScale);
    setSmoothing(nextPreset.smoothing);
  }, []);

  const onPickFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setDecodeError(null);
    setLiftError(null);
    setBusy(true);
    try {
      const next = await decodeStudioLift3dFile(file);
      setDecoded(next);
      setTab("source");
    } catch (error) {
      setDecoded(null);
      setResult(null);
      setDecodeError(
        error instanceof StudioLift3dDecodeError
          ? error.message
          : "이미지를 여는 중 문제가 생겼습니다. 다른 파일로 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // 설정이 바뀔 때마다 변환을 다시 돌린다. 한 프레임 미뤄 두면 슬라이더를 끄는 동안의
  // 중간 값들이 자연스럽게 합쳐지고, 무거운 계산이 입력 반응을 막지 않는다.
  useEffect(() => {
    if (decoded === null) {
      setResult(null);
      setWarnings([]);
      return;
    }
    setBusy(true);
    const handle = globalThis.setTimeout(() => {
      const lifted = liftStudioImageTo3dGlb(
        decoded.source,
        {
          subject,
          resolution,
          depthScale,
          smoothing,
          invertRelief,
        },
        {
          name: decoded.fileName.length > 0 ? decoded.fileName : "lift3d",
          texture: decoded.texture,
          unlit,
        },
      );
      if (lifted.ok) {
        setResult(lifted.value);
        setWarnings(lifted.warnings);
        setLiftError(null);
      } else {
        setResult(null);
        setWarnings([]);
        setLiftError(lifted.detail);
      }
      setBusy(false);
    }, 32);
    return () => {
      globalThis.clearTimeout(handle);
    };
  }, [decoded, subject, resolution, depthScale, smoothing, invertRelief, unlit]);

  const buffers = useMemo(
    () => (result === null ? null : buildStudioLift3dRenderBuffers(result.lift.geometry)),
    [result],
  );
  const maskPixels = useMemo(
    () => (result === null ? null : paintStudioLift3dMaskPreview(result.lift.mask)),
    [result],
  );
  const depthPixels = useMemo(
    () => (result === null ? null : paintStudioLift3dDepthPreview(result.lift.mask, result.lift.depth)),
    [result],
  );

  const onDownload = useCallback(() => {
    if (result === null) return;
    const blob = new Blob([result.glb.bytes as BlobPart], { type: result.glb.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.glb.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [result]);

  const metrics = result?.lift.metrics ?? null;
  // 텍스처가 빠진 채 내보내졌다면 미리보기도 무채색이어야 한다 — 파일과 화면이 달라지면
  // 사용자가 "저장하면 왜 밋밋하지"를 뒤늦게 발견한다.
  const previewTextureUrl = (result?.glb.metrics.textureByteLength ?? 0) > 0 ? sourceUrl : null;

  return (
    <section
      aria-labelledby="studio-lift3d-title"
      className="min-h-dvh bg-bg px-4 py-8 text-fg sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-3">Studio</p>
            <h1 id="studio-lift3d-title" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              2D → 3D 변환
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-fg-2">
              캐릭터·소품·배경 원화를 실루엣과 명암으로 읽어 3D 모델로 세웁니다. 변환은 이 기기
              안에서만 이뤄지고, 결과 GLB 는 배경 3D 씬에 그대로 가져다 쓸 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-studio-route-exit="editor"
              onClick={() => navigate("/studio")}
              className={SECONDARY_BUTTON_CLASS}
            >
              Studio 편집기 열기
            </button>
            <Link href="/create" data-studio-route-exit="site" className={SECONDARY_BUTTON_CLASS}>
              창작 게시판으로
            </Link>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            <div className={CARD_CLASS}>
              <h2 className="text-sm font-semibold">1. 원화 선택</h2>
              <label className="mt-3 block">
                <span className="sr-only">변환할 이미지 파일</span>
                <input
                  type="file"
                  accept={STUDIO_LIFT3D_ACCEPTED_MIME_TYPES.join(",")}
                  onChange={(event) => {
                    void onPickFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  className="block w-full text-xs text-fg-2 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-raised file:px-4 file:text-sm file:font-semibold file:text-fg hover:file:bg-raised/80"
                />
              </label>
              <p className="mt-2 text-xs leading-relaxed text-fg-3">
                PNG · JPEG · WebP. 캐릭터·소품은 <strong className="font-semibold text-fg-2">배경을 지운 PNG</strong>
                일 때 실루엣이 가장 정확합니다.
              </p>
              {decoded !== null ? (
                <p className="mt-2 font-mono text-xs text-fg-3">
                  {decoded.fileName} · {decoded.naturalWidth}×{decoded.naturalHeight}px
                </p>
              ) : null}
              {decodeError !== null ? (
                <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">{decodeError}</p>
              ) : null}
            </div>

            <div className={CARD_CLASS}>
              <h2 className="text-sm font-semibold">2. 무엇을 만들까요</h2>
              {/* 네이티브 라디오라 방향키 이동·폼 시맨틱을 브라우저가 그대로 처리한다. */}
              <fieldset className="mt-3 grid gap-2">
                <legend className="sr-only">피사체 종류</legend>
                {STUDIO_LIFT3D_SUBJECTS.map((candidate) => {
                  const option = STUDIO_LIFT3D_PRESETS[candidate];
                  return (
                    <label
                      key={candidate}
                      className="block cursor-pointer rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-raised has-[input:checked]:border-accent has-[input:checked]:bg-accent/10 has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent"
                    >
                      <input
                        type="radio"
                        name={`${subjectGroupName}-subject`}
                        value={candidate}
                        checked={candidate === subject}
                        onChange={() => selectSubject(candidate)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">
                        {option.hint}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            </div>

            <div className={CARD_CLASS}>
              <h2 className="text-sm font-semibold">3. 다듬기</h2>
              <div className="mt-3 space-y-4">
                <SliderField
                  label="해상도"
                  value={resolution}
                  min={STUDIO_LIFT3D_LIMITS.minResolution}
                  max={STUDIO_LIFT3D_LIMITS.maxResolution}
                  step={8}
                  display={`${resolution}px`}
                  onChange={setResolution}
                />
                <SliderField
                  label={preset.geometryMode === "relief" ? "돌출 깊이" : "두께"}
                  value={depthScale}
                  min={0.02}
                  max={1}
                  step={0.02}
                  display={`${Math.round(depthScale * 100)}%`}
                  onChange={setDepthScale}
                />
                <SliderField
                  label="매끄럽게"
                  value={smoothing}
                  min={0}
                  max={12}
                  step={1}
                  display={`${smoothing}회`}
                  onChange={setSmoothing}
                />
                {preset.geometryMode === "relief" ? (
                  <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                    <input
                      type="checkbox"
                      checked={invertRelief}
                      onChange={(event) => setInvertRelief(event.target.checked)}
                      className="size-4 accent-accent"
                    />
                    어두운 면을 앞으로 (역광 배경)
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                  <input
                    type="checkbox"
                    checked={unlit}
                    onChange={(event) => setUnlit(event.target.checked)}
                    className="size-4 accent-accent"
                  />
                  조명 없이 원화 그대로 (unlit)
                </label>
              </div>
            </div>

            <div className={CARD_CLASS}>
              <h2 className="text-sm font-semibold">4. 내보내기</h2>
              <button
                type="button"
                onClick={onDownload}
                disabled={result === null || busy}
                className={`${PRIMARY_BUTTON_CLASS} mt-3 w-full`}
              >
                GLB 파일로 저장
              </button>
              <p className="mt-2 text-xs leading-relaxed text-fg-3">
                저장한 GLB 는 Studio 의 배경 3D 편집기에서 <strong className="font-semibold text-fg-2">모델 가져오기</strong>
                로 그대로 불러올 수 있습니다.
              </p>
              {liftError !== null ? (
                <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">{liftError}</p>
              ) : null}
              <div className="mt-3">
                <WarningList warnings={warnings} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div
              role="tablist"
              aria-label="미리보기 화면"
              className="flex flex-wrap gap-1 rounded-lg border border-line bg-card/60 p-1"
            >
              {PREVIEW_TABS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={tab === candidate}
                  onClick={() => setTab(candidate)}
                  className={`min-h-9 flex-1 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    tab === candidate ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised"
                  }`}
                >
                  {PREVIEW_TAB_LABELS[candidate]}
                </button>
              ))}
            </div>

            <div className="grid min-h-[24rem] place-items-center overflow-hidden rounded-xl border border-line bg-panel p-3 lg:min-h-[32rem]">
              {decoded === null ? (
                <p className="max-w-[36ch] text-center text-sm leading-relaxed text-fg-3">
                  변환할 원화를 선택하면 실루엣·깊이·3D 결과를 여기에서 확인할 수 있습니다.
                </p>
              ) : tab === "source" ? (
                sourceUrl === null ? (
                  <p className="text-sm text-fg-3">원화 미리보기를 사용할 수 없습니다.</p>
                ) : (
                  <img
                    src={sourceUrl}
                    alt="선택한 원화"
                    className="max-h-full max-w-full object-contain"
                  />
                )
              ) : result === null ? (
                <p className="max-w-[36ch] text-center text-sm leading-relaxed text-fg-3">
                  {busy ? "변환하는 중입니다..." : liftError ?? "아직 변환 결과가 없습니다."}
                </p>
              ) : tab === "mask" && maskPixels !== null ? (
                <RasterPreview
                  width={result.lift.mask.width}
                  height={result.lift.mask.height}
                  pixels={maskPixels}
                  label="추출한 실루엣 마스크"
                />
              ) : tab === "depth" && depthPixels !== null ? (
                <RasterPreview
                  width={result.lift.mask.width}
                  height={result.lift.mask.height}
                  pixels={depthPixels}
                  label="추정한 깊이장"
                />
              ) : buffers !== null ? (
                <div className="h-[24rem] w-full lg:h-[32rem]">
                  <Suspense fallback={<StudioPanelLoading label="3D 미리보기를 여는 중..." />}>
                    <StudioLift3dPreview
                      buffers={buffers}
                      textureUrl={previewTextureUrl}
                      unlit={unlit}
                    />
                  </Suspense>
                </div>
              ) : null}
            </div>

            {metrics !== null ? (
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[
                  ["삼각형", metrics.triangleCount.toLocaleString("ko-KR")],
                  ["정점", metrics.vertexCount.toLocaleString("ko-KR")],
                  ["작업 격자", `${metrics.gridWidth}×${metrics.gridHeight}`],
                  ["위상", metrics.closed ? "닫힌 solid" : `열린 변 ${metrics.boundaryEdgeCount}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-card/60 px-3 py-2">
                    <dt className="text-fg-3">{label}</dt>
                    <dd className="mt-0.5 font-mono text-sm text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
