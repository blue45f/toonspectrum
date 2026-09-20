import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { WorkspaceResumeSnapshot } from "./studio-workspace-resume";

export function WorkspaceResumeNotice({ snapshot, onRetry }: {
  readonly snapshot: WorkspaceResumeSnapshot;
  readonly onRetry: () => void;
}) {
  const bt = useBilingual("WorkspaceResumeNotice");
  if (snapshot.status !== "unavailable" && snapshot.status !== "storage-error") return null;
  const missing = snapshot.status === "unavailable";
  return <section className="workspace-notice workspace-resume-notice" role="status" data-workspace-resume-notice={snapshot.status}>
    <p>{missing
      ? bt("최근 원고가 삭제·보관되었거나 이 기기에 없습니다. 다른 원고를 대신 열지 않았습니다.", "The last manuscript is archived, deleted or unavailable on this device. No other manuscript has been substituted.")
      : bt("이어하기 정보를 읽지 못했습니다. 이전 작업 위치를 사용하지 않고 저장 공간 확인을 기다립니다.", "Resume details could not be read. The previous destination will not be used until storage is checked.")}</p>
    {snapshot.target ? <Link href={snapshot.target.href}>{missing ? bt("원고 목록 확인", "Check manuscripts") : bt("저장 공간 확인", "Check storage")}</Link> : null}
    <button type="button" onClick={onRetry}>{bt("이어하기 다시 확인", "Recheck resume")}</button>
  </section>;
}
