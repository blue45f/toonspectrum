import { CheckCircle2, Download, FileArchive, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { ProductionReviewCandidate } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import {
  buildProductionPageManifestArchive,
  collectProductionReviewManifestPages,
  downloadProductionPageManifestArchive,
} from "./production-page-manifest-archive";

export function ProductionQuickExportPanel({
  projectId,
  workId,
  candidate,
  process,
}: {
  readonly projectId: string;
  readonly workId: string;
  readonly candidate: ProductionReviewCandidate | null;
  readonly process: ProductionManuscriptProcess | null;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const approved = candidate?.review.status === "approved";
  const finalCurrent = Boolean(process?.approvedRevision && !process.hasUnapprovedChanges);
  const requiredClear = (process?.openRequiredFeedbackCount ?? 0) === 0;

  const download = async () => {
    if (!candidate || !process || busy) return;
    setBusy(true);
    setProgress(0);
    setNotice("");
    try {
      const pages = await collectProductionReviewManifestPages(candidate);
      const result = await buildProductionPageManifestArchive({
        projectId,
        workId,
        artifactId: process.artifact.id,
        title: `${process.artifact.title}-${approved && finalCurrent ? "approved" : "review"}`,
        pages,
        onProgress: ({ completedFiles, totalFiles }) => setProgress(Math.round((completedFiles / Math.max(1, totalFiles)) * 100)),
      });
      downloadProductionPageManifestArchive(result);
      setNotice(`${pages.length}페이지를 검증해 ${approved && finalCurrent ? "승인본" : "검수용"} CBZ로 저장했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "빠른 출력 파일을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-3xl border border-accent/30 bg-card p-4 sm:p-6" aria-labelledby="quick-export-title" data-production-quick-export="">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2"><span className="inline-flex min-h-7 items-center rounded-full border border-accent/35 bg-accent-soft px-2.5 text-[0.625rem] font-black text-accent">QUICK EXPORT</span>{approved && finalCurrent && requiredClear ? <span className="inline-flex min-h-7 items-center rounded-full border border-good/35 bg-good/10 px-2.5 text-[0.625rem] font-bold text-good"><ShieldCheck className="mr-1 size-3.5" aria-hidden="true" /> 승인 기준 충족</span> : <span className="inline-flex min-h-7 items-center rounded-full border border-warn/35 bg-warn/10 px-2.5 text-[0.625rem] font-bold text-warn">검수용 출력</span>}</div>
        <h2 id="quick-export-title" className="mt-3 text-xl font-black text-fg">원고 페이지를 바로 CBZ로 받습니다</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">선택한 고정 검수본의 모든 페이지를 가져와 크기와 SHA-256을 검증하고, 페이지 순서와 source manifest를 포함한 단순 출력 패키지를 만듭니다. 수신자 binding·인수 확인이 필요한 공식 전달은 아래 별도 도구를 사용합니다.</p>
      </div>
      <button type="button" disabled={!candidate || !process || busy} onClick={() => void download()} className={buttonClass({ size: "sm", className: "min-h-11 shrink-0" })}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} {busy ? `검증·출력 ${progress}%` : "전체 페이지 빠른 출력"}</button>
    </div>
    {!candidate ? <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-fg-2"><FileArchive className="mr-2 inline size-4" aria-hidden="true" /> 피드백 탭에서 고정 검수본을 선택하면 빠른 출력을 사용할 수 있습니다.</div> : <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.625rem] font-bold text-fg-3">원본</p><p className="mt-1 truncate text-xs font-black text-fg">{candidate.review.title}</p></div><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.625rem] font-bold text-fg-3">상태</p><p className={cn("mt-1 text-xs font-black", approved ? "text-good" : "text-warn")}>{approved ? "검수 승인" : candidate.review.status === "changes-requested" ? "수정 요청" : "검수 중"}</p></div><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.625rem] font-bold text-fg-3">용도</p><p className="mt-1 text-xs font-black text-fg">{approved && finalCurrent ? "승인본 빠른 출력" : "내부 검수·확인용"}</p></div></div>}
    {notice ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-panel p-3 text-xs text-fg-2" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />{notice}</p> : null}
  </section>;
}
