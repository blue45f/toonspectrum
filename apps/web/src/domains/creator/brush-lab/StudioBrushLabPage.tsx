import { useParams } from "react-router-dom";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { StudioBrushV5Composer } from "./StudioBrushV5Composer";

export function StudioBrushLabPage() {
  const params = useParams<{ workId?: string; sourceWorkId?: string }>();
  const scope = params.workId
    ? `work:${params.workId}`
    : params.sourceWorkId
      ? `remix:${params.sourceWorkId}`
      : "draft";
  const editorHref = params.workId
    ? `/studio/work/${encodeURIComponent(params.workId)}/canvas`
    : params.sourceWorkId
      ? `/studio/remix/${encodeURIComponent(params.sourceWorkId)}/canvas`
      : "/studio";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1880px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 overflow-hidden rounded-3xl border border-line bg-card/55 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-accent">
              Creator Technology Lab
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              브러시 스튜디오 V5
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">
              필기감, 스트로크 엔진, 촉, 표면, 재료, 안료, 복수 물리 엔진, 패턴과 마감을
              조합해 독립적인 브러시 프로그램을 제작합니다. 기존 프리셋 재생 모델에 맞추지 않고
              V5 프로그램 자체를 새 권위로 사용합니다.
            </p>
          </div>
          <a
            href={editorHref}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
          >
            캔버스로 돌아가기
          </a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[0.68rem] font-bold text-fg-2">
          {[
            "WebGPU 우선",
            "Inkwash",
            "Krita PaintOp",
            "libmypaint · Hokusai",
            "Spectral · Open K/S · Mixbox",
            "복수 물리",
            "패턴 그래프",
          ].map((label) => (
            <span key={label} className="rounded-full border border-line bg-bg-2/55 px-3 py-1.5">
              {label}
            </span>
          ))}
        </div>
      </header>

      <StudioBrushV5Composer scope={scope} />
    </main>
  );
}
