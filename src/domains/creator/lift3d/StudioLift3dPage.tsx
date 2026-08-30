import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { downloadBlob } from "../export/studio-export";
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

import type { StudioLift3dLibraryRights } from "./studio-lift3d-library-handoff";

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

/**
 * 배경 3D 편집기의 업로드 패널과 같은 문구.
 *
 * "구매·허가"(licensed)는 라이선스 이름을 함께 받아야 저장되는데 여기엔 그 입력이 없다.
 * 받을 수 없는 선언은 제안하지 않는다 — 자세한 이유는 StudioLift3dLibraryRights 참고.
 */
const LIBRARY_RIGHTS_OPTIONS: ReadonlyArray<{
  readonly id: StudioLift3dLibraryRights;
  readonly label: string;
}> = [
  { id: "unknown", label: "확인 전 — 상업 이용 보류" },
  { id: "owned", label: "직접 제작 — 내가 만든 원화" },
  { id: "public-domain", label: "공개 이용(퍼블릭 도메인)" },
];
const CARD_CLASS = "rounded-xl border border-line bg-card/60 p-4";

/** 등록 결과 문구에 쓸 권리 표기 이름. 목록에 없는 값이면 식별자를 그대로 보여준다. */
function rightsLabel(rights: StudioLift3dLibraryRights): string {
  return LIBRARY_RIGHTS_OPTIONS.find((option) => option.id === rights)?.label ?? rights;
}

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
  const [frontRatio, setFrontRatio] = useState(preset.frontRatio);
  const [layerBands, setLayerBands] = useState(1);
  const [busy, setBusy] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryRights, setLibraryRights] = useState<StudioLift3dLibraryRights>("unknown");
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
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
    setFrontRatio(nextPreset.frontRatio);
    setLayerBands(1);
    setLibraryNotice(null);
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
    setLibraryNotice(null);
    const handle = globalThis.setTimeout(() => {
      // 타이머 콜백의 예외는 React 에러 경계가 잡지 못한다. 감싸지 않으면 busy 가 영원히
      // true 로 남아 저장 버튼이 잠기고, 화면에는 이전 결과와 지표가 그대로 남는다.
      try {
        const lifted = liftStudioImageTo3dGlb(
          decoded.source,
          {
            subject,
            resolution,
            depthScale,
            smoothing,
            invertRelief,
            frontRatio,
            layerBands,
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
      } catch (error) {
        setResult(null);
        setWarnings([]);
        setLiftError(
          error instanceof Error
            ? `변환 중 문제가 생겼습니다: ${error.message}`
            : "변환 중 알 수 없는 문제가 생겼습니다. 해상도를 낮춰 다시 시도해 주세요.",
        );
      } finally {
        setBusy(false);
      }
    }, 32);
    return () => {
      globalThis.clearTimeout(handle);
    };
  }, [decoded, subject, resolution, depthScale, smoothing, invertRelief, unlit, frontRatio, layerBands]);

  // 내보내기가 이미 만들어 둔 버퍼를 그대로 쓴다. 여기서 다시 만들면 슬라이더를 한 칸 옮길
  // 때마다 삼각형화와 법선 계산을 두 번씩 하게 된다.
  const buffers = result?.buffers ?? null;
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
    downloadBlob(
      new Blob([result.glb.bytes as BlobPart], { type: result.glb.mimeType }),
      result.glb.fileName,
    );
  }, [result]);

  // 등록은 비동기라, 그 사이에 사용자가 원화나 설정을 바꾸면 화면의 모델과 저장된 모델이
  // 달라진다. 클릭 시점의 결과를 기억해 두고, 완료 시점에 화면이 그대로인지 확인한다.
  // 권리 표기도 같이 본다 — 모델은 그대로인데 표기만 바뀌면 화면에는 "공개 이용" 이 떠 있는데
  // 라이브러리에는 "확인 전" 로 박힌 모델이 남고, 성공 문구가 그 어긋남을 덮어 버린다.
  const latestResultRef = useRef<StudioLift3dExport | null>(null);
  latestResultRef.current = result;
  const latestRightsRef = useRef<StudioLift3dLibraryRights>(libraryRights);
  latestRightsRef.current = libraryRights;

  const onSaveToLibrary = useCallback(async () => {
    const target = result;
    const targetRights = libraryRights;
    if (target === null) return;
    setLibrarySaving(true);
    setLibraryNotice(null);
    try {
      // 모델 라이브러리는 OPFS·SQLite 까지 끌고 오는 큰 그래프다. 저장을 누르는 순간에만
      // 불러와, 변환만 하고 나가는 사용자가 그 비용을 내지 않게 한다.
      const { saveStudioLift3dToBg3dLibrary } = await import("./studio-lift3d-library-handoff");
      const saved = await saveStudioLift3dToBg3dLibrary(target.glb, targetRights);
      const staleModel = latestResultRef.current !== target;
      const staleRights = latestRightsRef.current !== targetRights;
      setLibraryNotice(saved.ok
        ? staleModel || staleRights
          ? `등록을 누른 시점의 모델을 "${rightsLabel(targetRights)}" 로 등록했습니다. `
            + "지금 화면의 설정으로는 다시 등록해 주세요."
          : "배경 3D 편집기의 모델 목록에 등록했습니다."
        : saved.detail);
    } catch {
      setLibraryNotice("3D 모델 라이브러리를 열 수 없습니다. 대신 GLB 파일로 저장해 주세요.");
    } finally {
      setLibrarySaving(false);
    }
  }, [result, libraryRights]);

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
                {preset.geometryMode === "inflate" ? (
                  <SliderField
                    label="앞쪽 두께 비율"
                    value={frontRatio}
                    min={0.2}
                    max={0.8}
                    step={0.02}
                    display={`앞 ${Math.round(frontRatio * 100)}%`}
                    onChange={setFrontRatio}
                  />
                ) : (
                  <SliderField
                    label="시차 레이어"
                    value={layerBands}
                    min={1}
                    max={12}
                    step={1}
                    display={layerBands < 2 ? "연속 부조" : `${layerBands}층`}
                    onChange={setLayerBands}
                  />
                )}
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
              {/*
                이용 권리는 원화의 권리를 따르는데 그건 이 코드가 알 수 없다. 편집기 업로드
                패널이 사용자에게 묻는 것과 같은 네 가지를, 같은 문구로 묻는다.
              */}
              <label className="mt-3 block space-y-1.5">
                <span className={FIELD_LABEL_CLASS}>
                  <span>이용 권리</span>
                </span>
                <select
                  value={libraryRights}
                  onChange={(event) => {
                    setLibraryRights(event.target.value as StudioLift3dLibraryRights);
                    setLibraryNotice(null);
                  }}
                  className="min-h-11 w-full rounded-lg border border-line bg-raised px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {LIBRARY_RIGHTS_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onSaveToLibrary()}
                disabled={result === null || busy || librarySaving}
                className={`${PRIMARY_BUTTON_CLASS} mt-3 w-full`}
              >
                {librarySaving ? "등록하는 중..." : "배경 3D 모델로 등록"}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-fg-3">
                배경 3D 편집기의 모델 목록에 바로 올라갑니다. 파일을 내려받았다가 다시 올릴
                필요가 없습니다.
              </p>
              {libraryNotice !== null ? (
                <p role="status" className="mt-2 text-xs leading-relaxed text-fg-2">{libraryNotice}</p>
              ) : null}
              <button
                type="button"
                onClick={onDownload}
                disabled={result === null || busy}
                className={`${SECONDARY_BUTTON_CLASS} mt-3 w-full`}
              >
                GLB 파일로 저장
              </button>
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
                  metrics.layerCount > 1
                    ? ["레이어", `${metrics.layerCount}층`]
                    : metrics.symmetryScore !== null
                      ? [
                        "좌우대칭",
                        `${Math.round(metrics.symmetryScore * 100)}%${metrics.symmetryApplied ? " · 보정" : ""}`,
                      ]
                      : ["작업 격자", `${metrics.gridWidth}×${metrics.gridHeight}`],
                  [
                    "위상",
                    metrics.closed
                      ? "닫힌 solid"
                      : metrics.boundaryEdgeCount > 0
                        ? `열린 변 ${metrics.boundaryEdgeCount}`
                        : `위상 오류 ${metrics.topologyErrorCount}`,
                  ],
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
