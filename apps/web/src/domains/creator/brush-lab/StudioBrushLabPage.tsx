import { useParams } from "react-router-dom";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";

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
    <main className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 overflow-hidden rounded-3xl border border-line bg-card/55 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-5xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-accent">
              Creator Material Engineering Lab
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              브러시 스튜디오 V6 · Physical Quality Authority
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">
              기존 브러시 저장 구조와 마이그레이션 제약을 사용하지 않습니다. 실제 필기감, 종이 접촉,
              안료 혼합, 습식·강모·입자·반응 물리, 패턴 위상과 commit/export 품질을 새 브러시 권위로 컴파일합니다.
              동일한 질감은 WebGPU 실행 경로를 우선하고, 물성과 결과가 분명히 다를 때만 독립 렌디션으로 유지합니다.
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
            "72개 타입 노드",
            "17개 시그니처 레시피",
            "실제 입력 필기 패드",
            "필압·틸트·호버·팜리젝션",
            "Inkwash · Thin-film · Reaction",
            "Krita · libmypaint · Hokusai",
            "Spectral · Open K/S · pigment-painter",
            "Mixbox 대체 불가능성 게이트",
            "결정적 패턴·타일 영수증",
          ].map((label) => (
            <span key={label} className="rounded-full border border-line bg-bg-2/55 px-3 py-1.5">
              {label}
            </span>
          ))}
        </div>
      </header>

      <StudioBrushV6Workbench scope={scope} />
    </main>
  );
}
