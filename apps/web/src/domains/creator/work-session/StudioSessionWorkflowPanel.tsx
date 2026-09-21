import { useEffect, useState } from "react";
import type { StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import type { StudioReviewSourceReference } from "@toonspectrum/studio-project-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import { StudioSessionAgenda } from "./StudioSessionAgenda";
import { StudioSessionMaterialBoard } from "./StudioSessionMaterialBoard";
import { useSessionResourceMetadata } from "./use-session-resource-metadata";
import type { StudioWorkSessionController } from "./studio-work-session-controller";
import type { StudioSessionPreviewRequest } from "./StudioWorkSessionPreview";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
export function StudioSessionWorkflowPanel({ view, actorId, controller, busy, saving = busy, name, onInspect }: {
  readonly view: StudioWorkSessionView; readonly actorId: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly saving?: boolean; readonly name: (id: string) => string; readonly onInspect: (request: StudioSessionPreviewRequest) => void;
}) {
  const bt = useBilingual("StudioSessionWorkflowPanel");
  const resources = useSessionResourceMetadata(view.session, () => controller.suspend());
  const [requested, setRequested] = useState<StudioReviewSourceReference | null>(null);
  const [inspectionFailed, setInspectionFailed] = useState(false);
  const data = resources.data;
  useEffect(() => {
    if (!requested || !data) return;
    const page = data.pages.find((item) => item.source.pageOrdinal === requested.pageOrdinal);
    if (!page || page.source.pageId !== requested.pageId || page.source.sourceContentDigest !== requested.sourceContentDigest
      || page.source.sourceServerRevision !== requested.sourceServerRevision
      || (requested.frameId && !page.frameIds.includes(requested.frameId))) {
      setInspectionFailed(true); setRequested(null); return;
    }
    onInspect({ id: newStudioProjectGraphId("session-inspection"), source: requested, cursor: page.previewCursor });
    setRequested(null); setInspectionFailed(false);
  }, [requested, data, onInspect]);
  const inspect = (source: StudioReviewSourceReference) => {
    setRequested(source); setInspectionFailed(false);
    if (!data?.pages.some((page) => page.source.pageOrdinal === source.pageOrdinal)) resources.setOffset(source.pageOrdinal);
  };
  return <div className="space-y-3" data-session-purpose-workflow={view.session.kind}>
    <p className="text-xs text-fg-3">{bt("현재 세션의 추가 기록 가능 횟수", "Remaining operations in this session")} · {Math.max(0, 128 - view.session.version)}
      {view.session.version >= 120 ? ` · ${bt("결론을 정리하고 세션을 종료한 뒤 다음 세션을 시작하세요.", "Summarize and close before starting a subsequent session.")}` : ""}</p>
    {!data ? <p role="status" className="text-xs">{resources.failed ? bt("고정 원고·등록 파일을 확인하지 못했습니다. 기존 세션 기록은 유지됩니다.", "Pinned source and registered files could not be verified. Existing session records are preserved.")
      : bt("고정 원고와 등록된 파일 확인 중…", "Checking pinned source and registered files…")}</p> : null}
    {data?.sourceStatus === "unavailable" && view.session.kind !== "material-choice" ? <p role="status" className="text-sm">{bt("이 검수본에는 검증된 원본 페이지 연결이 없습니다. 새 고정 검수본을 생성한 후 페이지 안건을 연결하세요. 임의의 페이지로 대체하지 않습니다.", "This snapshot has no verified authoring-page mapping. Capture a new pinned review before adding page agenda items. No page is substituted.")}</p> : null}
    {requested ? <p role="status" className="text-xs">{bt("선택한 고정 페이지 확인 중…", "Verifying the selected pinned page…")}</p> : null}
    {inspectionFailed ? <p role="alert" className="text-xs">{bt("요청한 페이지·컷을 확인할 수 없어 다른 페이지를 열지 않았습니다.", "The requested page/cut could not be verified; no substitute was opened.")}</p> : null}
    <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={busy} onClick={resources.refresh}>{bt("원고·파일 다시 확인", "Recheck source and files")}</button>
      {view.session.kind !== "material-choice" ? <><button type="button" className={control} disabled={busy || resources.offset === 0} onClick={() => resources.setOffset(0)}>{bt("처음 페이지 목록", "First source pages")}</button>
        {data?.nextPageOffset !== null && data?.nextPageOffset !== undefined ? <button type="button" className={control} disabled={busy} onClick={() => resources.setOffset(data.nextPageOffset!)}>{bt("다음 페이지 목록", "Next source pages")}</button> : null}</> : null}</div>
    {view.session.kind === "material-choice" ? <StudioSessionMaterialBoard view={view} actorId={actorId} controller={controller} saving={saving} busy={busy || view.session.version >= 128} resources={data} name={name} />
      : <StudioSessionAgenda view={view} actorId={actorId} controller={controller} saving={saving} busy={busy || view.session.version >= 128} resources={data} name={name} onInspect={inspect} />}
  </div>;
}
