import { useEffect, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createArtifactReviewLifecycle } from "./artifact-review-lifecycle";
import type {
  ArtifactReviewControls,
  ArtifactReviewFrame,
  ArtifactReviewMeasurement,
  ArtifactReviewMode,
  ArtifactReviewSource,
} from "./artifact-review-contract";
import type { SpecialistArtifact } from "./specialist-contract";

const BUTTON =
  "min-h-11 rounded border border-line px-3 text-xs disabled:opacity-45";
/** Isolated source/result review, never the owner of canonical scene or apply history. */
export function StudioScene3dArtifactPreview({
  artifact,
  source,
  active = true,
}: {
  readonly artifact: SpecialistArtifact;
  readonly source?: ArtifactReviewSource;
  readonly active?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ArtifactReviewControls | null>(null);
  const owner = useRef<ReturnType<
    typeof createArtifactReviewLifecycle<ArtifactReviewControls>
  > | null>(null);
  const savedFrame = useRef<ArtifactReviewFrame | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [compare, setCompare] = useState(false);
  const [mode, setMode] = useState<ArtifactReviewMode>("wipe");
  const [divider, setDivider] = useState(50);
  const [wireframe, setWireframe] = useState(false);
  const [measurement, setMeasurement] =
    useState<ArtifactReviewMeasurement | null>(null);
  const t = useBilingual("scene3d-specialists");
  useEffect(() => {
    const element = host.current;
    if (!element || !active) {
      setReady(false);
      controls.current = null;
      return;
    }
    const lifecycle =
      owner.current ??
      (owner.current = createArtifactReviewLifecycle<ArtifactReviewControls>());
    setReady(false);
    setError(false);
    setMeasurement(null);
    controls.current = null;
    let current = true;
    const cancel = lifecycle.replace(
      async (signal) => {
        const { createArtifactReviewRuntime } = await import(
          "./artifact-review-runtime"
        );
        return createArtifactReviewRuntime({
          host: element,
          artifact,
          ...(compare && source ? { source } : {}),
          signal,
          restore: savedFrame.current,
          onFrame: (frame) => {
            if (current) savedFrame.current = frame;
          },
          onMeasurement: (value) => {
            if (current) setMeasurement(value);
          },
          onError: () => {
            if (current) {
              setError(true);
              setReady(false);
            }
          },
        });
      },
      (session) => {
        if (!current) return;
        controls.current = session;
        setReady(true);
      },
      () => {
        if (current) {
          setError(true);
          setReady(false);
        }
      },
    );
    return () => {
      current = false;
      controls.current = null;
      cancel();
    };
  }, [artifact, source, compare, active, attempt]);
  useEffect(() => {
    if (!ready) return;
    controls.current?.setMode(compare ? mode : "result");
    controls.current?.setDivider(divider / 100);
    controls.current?.setWireframe(wireframe);
  }, [ready, compare, mode, divider, wireframe]);
  useEffect(
    () => () => {
      owner.current?.dispose();
      owner.current = null;
      controls.current = null;
    },
    [],
  );
  const locked = !active || !ready || error;
  return (
    <div data-scene3d-review="true" className="space-y-2">
      {source && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={!active}
            aria-pressed={compare}
            onClick={() => setCompare((value) => !value)}
          >
            {compare
              ? t("비교 종료", "Close comparison")
              : t("원본과 비교", "Compare with source")}
          </button>
          {compare && (
            <span className="text-xs text-fg-3">
              {t(
                "같은 카메라·배율·참고 조명 · 모델 좌표는 변경하지 않습니다.",
                "Same camera, scale and reference lighting · model coordinates are unchanged.",
              )}
            </span>
          )}
        </div>
      )}
      <div className="relative">
        <div
          ref={host}
          className="h-[280px] w-full overflow-hidden rounded-lg border border-line"
          aria-label={t(
            "가공 결과 3D 미리보기",
            "Processed 3D artifact preview",
          )}
        />
        {compare && source && ready && !error && (
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            {mode !== "result" && (
              <span className="absolute left-2 top-2 rounded bg-panel px-2 py-1 text-xs">
                {t("원본", "Source")}
              </span>
            )}
            {mode !== "source" && (
              <span className="absolute right-2 top-2 rounded bg-panel px-2 py-1 text-xs">
                {t("가공 결과", "Result")}
              </span>
            )}
            {mode === "wipe" && (
              <span
                className="absolute inset-y-0 w-px bg-white"
                style={{ left: `${divider}%` }}
              />
            )}
          </div>
        )}
      </div>
      {compare && source && (
        <div className="space-y-2">
          <div
            role="group"
            aria-label={t("원본·결과 표시", "Source and result display")}
            className="flex flex-wrap gap-2"
          >
            {(["source", "wipe", "result"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={BUTTON}
                disabled={locked}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value === "source"
                  ? t("원본만", "Source only")
                  : value === "result"
                    ? t("결과만", "Result only")
                    : t("분할 비교", "Wipe comparison")}
              </button>
            ))}
          </div>
          {mode === "wipe" && (
            <label className="block text-xs">
              {t("비교 분할 위치", "Comparison divider")}
              <input
                aria-label={t("비교 분할 위치", "Comparison divider")}
                type="range"
                min="0"
                max="100"
                value={divider}
                disabled={locked}
                onChange={(event) =>
                  setDivider(Number(event.currentTarget.value))
                }
                className="block min-h-11 w-full"
              />
            </label>
          )}
        </div>
      )}
      <div
        role="toolbar"
        aria-label={t("3D 미리보기 탐색", "3D preview navigation")}
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          className={BUTTON}
          disabled={locked}
          onClick={() => controls.current?.fit()}
        >
          {t("화면에 맞춤", "Fit view")}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={locked}
          onClick={() => controls.current?.zoom(0.8)}
        >
          {t("확대", "Zoom in")}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={locked}
          onClick={() => controls.current?.zoom(1.25)}
        >
          {t("축소", "Zoom out")}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={locked}
          aria-pressed={wireframe}
          onClick={() => setWireframe((value) => !value)}
        >
          {t("와이어프레임", "Wireframe")}
        </button>
        {(["front", "right", "top", "iso"] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={BUTTON}
            disabled={locked}
            onClick={() => controls.current?.orient(view)}
          >
            {view === "front"
              ? t("정면", "Front")
              : view === "right"
                ? t("우측", "Right")
                : view === "top"
                  ? t("위쪽", "Top")
                  : t("입체 보기", "Three-quarter view")}
          </button>
        ))}
      </div>
      {compare && measurement && (
        <div
          className="rounded border border-line p-2 text-xs leading-relaxed"
          data-scene3d-review-measurements="true"
        >
          <div>
            {t("표시 메시 삼각형", "Displayed mesh triangles")}:{" "}
            {measurement.sourceTriangles.toLocaleString()} →{" "}
            {measurement.resultTriangles.toLocaleString()}
          </div>
          <div>
            {t("원본 XYZ 크기", "Source XYZ extent")}:{" "}
            {measurement.sourceSize.map((n) => n.toPrecision(4)).join(" × ")}
          </div>
          <div>
            {t("결과 XYZ 크기", "Result XYZ extent")}:{" "}
            {measurement.resultSize.map((n) => n.toPrecision(4)).join(" × ")}
          </div>
          <div>
            {t("중심 이동", "Center shift")}:{" "}
            {measurement.centerShift.toPrecision(4)}{" "}
            {t("모델 단위", "model units")}
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-xs text-fg-3">
        {error
          ? t(
              "미리보기 입력·예산·렌더링 검증을 완료하지 못했습니다. 비교를 종료하거나 파일을 별도로 확인하세요. 장면은 변경하지 않았습니다.",
              "Preview input, budget or rendering verification failed. Close comparison or inspect the files separately. The scene is unchanged.",
            )
          : !ready
            ? t("미리보기 준비 중…", "Preparing preview…")
            : t(
                "드래그로 회전 · 휠/핀치로 확대 · 정지 포즈의 참고 뷰이며 최종 원고 품질을 승인하지 않습니다.",
                "Drag to orbit · wheel/pinch to zoom · static reference view, not final-output quality approval.",
              )}
      </p>
      {error && (
        <button
          type="button"
          className={BUTTON}
          disabled={!active}
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("미리보기 다시 시도", "Retry preview")}
        </button>
      )}
      {compare && source && (
        <p className="break-all text-xs text-fg-3">
          {source.label} → {artifact.name} ·{" "}
          {source.bytes.length.toLocaleString()} B →{" "}
          {artifact.bytes.length.toLocaleString()} B
        </p>
      )}
      {wireframe && (
        <p className="text-xs text-fg-3">
          {t(
            "와이어프레임은 재질·투명도를 대신하는 형상 진단 표시입니다.",
            "Wireframe replaces materials and transparency for geometry inspection.",
          )}
        </p>
      )}
    </div>
  );
}
