import { useEffect, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  inspectNativeSplat,
  SPLAT_REFERENCE_MAX_COUNT,
} from "./splat-reference-contract";
import type { SparkReferenceSession } from "./splat-reference-runtime";

export function StudioScene3dSplatReferencePanel({
  disabled = false,
}: {
  readonly disabled?: boolean;
}) {
  const t = useBilingual("scene3d-specialists");
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<SparkReferenceSession | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  function stop() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    void session.current?.dispose();
    session.current = null;
    setBusy(false);
    setCount(null);
  }
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      void session.current?.dispose();
    },
    [],
  );
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  async function load(file: File | undefined) {
    if (!file || disabled) return;
    stop();
    const epoch = ++generation.current;
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    setError(null);
    try {
      if (
        file.size > SPLAT_REFERENCE_MAX_COUNT * 32 ||
        !file.name.toLowerCase().endsWith(".splat")
      )
        throw new Error(
          t(
            "현재 뷰어는 64MB 이하의 native .splat 파일을 지원합니다.",
            "This viewer supports native .splat files up to 64 MB.",
          ),
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      inspectNativeSplat(bytes);
      const { createSparkReferenceSession } = await import(
        "./splat-reference-runtime"
      );
      if (!host.current || epoch !== generation.current || next.signal.aborted)
        return;
      const value = await createSparkReferenceSession(
        host.current,
        bytes,
        next.signal,
        () => {
          if (epoch === generation.current && !next.signal.aborted) {
            setError(
              t(
                "GPU 참고 뷰어를 렌더링하지 못했습니다. 뷰어를 닫고 지원되는 브라우저에서 다시 열어 주세요.",
                "The GPU reference viewer could not render. Close it and reopen in a supported browser.",
              ),
            );
          }
        },
      );
      if (epoch !== generation.current) {
        await value.dispose();
        return;
      }
      session.current = value;
      setCount(value.count);
    } catch (error) {
      if (epoch === generation.current && !next.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Reference viewer failed.",
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-card p-3"
      aria-label={t(
        "Gaussian Splat 참고 뷰어",
        "Gaussian Splat reference viewer",
      )}
    >
      <h3 className="text-sm font-bold">Spark · Gaussian Splat</h3>
      <p className="text-xs leading-relaxed text-fg-2">
        {t(
          "로컬 native .splat 파일을 3D로 확인합니다. 참고 전용이며 현재 작품의 장면·원고 출력에 삽입하지 않습니다. 파일은 서버로 보내지 않습니다.",
          "Inspect a local native .splat file in 3D. Reference only: it is not inserted into the project scene or final output. Files are not uploaded.",
        )}
      </p>
      <label className="block text-xs">
        {t("참고 .splat 파일", "Reference .splat file")}
        <input
          aria-label={t("참고 .splat 파일", "Reference .splat file")}
          type="file"
          accept=".splat"
          disabled={disabled || busy}
          className="mt-1 block w-full"
          onChange={(event) => {
            void load(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {(busy || count !== null) && (
        <button
          className="min-h-11 rounded border border-line px-3 py-2 text-xs"
          onClick={stop}
        >
          {busy ? t("취소", "Cancel") : t("뷰어 닫기", "Close viewer")}
        </button>
      )}
      <div ref={host} className="min-h-16 w-full overflow-hidden rounded-lg" />
      <p role="status" className="text-xs text-fg-3">
        {busy
          ? t("로컬 파일을 여는 중…", "Opening local file…")
          : count !== null
            ? `${count.toLocaleString()} splats · ${t("드래그로 회전 · 휠/핀치로 확대", "Drag to orbit · wheel/pinch to zoom")}`
            : t(
                "파일 선택 후 뷰어를 시작합니다.",
                "Select a file to start the viewer.",
              )}
      </p>
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
