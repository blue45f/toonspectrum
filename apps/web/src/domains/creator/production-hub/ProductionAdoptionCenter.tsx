import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { ProductionReviewCandidate } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

type JourneyRole = "producer" | "artist" | "reviewer";
type View = "processes" | "workbench" | "versions" | "feedback" | "delivery" | "permissions";

const ROLE_COPY = {
  producer: { label: "PD·편집자", description: "병목을 찾고 검수·승인·전달까지 확인합니다." },
  artist: { label: "작가·작업자", description: "작업본을 만들고 수정 페이지를 제출합니다." },
  reviewer: { label: "외부 검토자", description: "고정 검수본만 열어 의견과 결정을 남깁니다." },
} as const;
interface JourneyStep {
  readonly title: string;
  readonly detail: string;
  readonly view?: View;
  readonly href?: string;
}

function journey(
  role: JourneyRole,
  editorHref: string | null,
  externalReviewHref: string | null,
): readonly JourneyStep[] {
  if (role === "producer") return [
    { title: "회차×공정 표에서 병목 확인", detail: "필수 수정·검수·FINAL 상태를 한 표에서 봅니다.", view: "processes" },
    { title: "여러 공정·회차 원고 비교", detail: "2~4분할 작업대에서 같은 위치를 검수합니다.", view: "workbench" },
    { title: "승인본 출력 또는 공식 전달", detail: "빠른 출력과 수신자 binding 전달을 구분합니다.", view: "delivery" },
  ];
  if (role === "artist") return [
    { title: "현재 작업본 이어서 편집", detail: "정확한 작품·공정 문맥으로 편집기를 엽니다.", href: editorHref ?? undefined },
    { title: "수정 페이지만 새 버전으로 구성", detail: "기존 페이지를 재사용하고 CBZ로 편집기에 전달합니다.", view: "versions" },
    { title: "필수 수정 해결 후 재제출", detail: "고정 피드백 위치를 확인하고 새 revision으로 제출합니다.", view: "feedback" },
  ];
  return [
    { title: "고정 검수본 열기", detail: "최신 HEAD로 바뀌지 않는 초대 원고만 확인합니다.", href: externalReviewHref ?? undefined },
    { title: "위치 의견과 필수 수정 남기기", detail: "페이지·컷·텍스트 위치와 담당자·기한을 기록합니다.", view: "feedback" },
    { title: "이전 검수본과 비교", detail: "작업대에서 변경 결과를 확인하고 승인 결정을 남깁니다.", view: "workbench" },
  ];
}

export function ProductionAdoptionCenter({
  isDemo,
  process,
  candidate,
  editorHref,
  externalReviewHref,
  onOpen,
}: {
  readonly isDemo: boolean;
  readonly process: ProductionManuscriptProcess | null;
  readonly candidate: ProductionReviewCandidate | null;
  readonly editorHref: string | null;
  readonly externalReviewHref: string | null;
  readonly onOpen: (view: View) => void;
}) {
  const [role, setRole] = useState<JourneyRole>("producer");
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const steps = journey(role, editorHref, externalReviewHref);
  const toggle = (index: number) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return <div className="space-y-4" data-production-adoption-center="">
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="adoption-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent"><GraduationCap className="size-4" aria-hidden="true" /> TWO-MINUTE START</p>
          <h2 id="adoption-title" className="mt-2 text-xl font-black text-fg">역할별 대표 과업을 실제 화면에서 완주합니다</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">소개 영상 대신 현재 프로젝트의 원고·검수·전달 화면으로 이동합니다. 샘플이나 데모 데이터는 실제 작업처럼 표시하지 않습니다.</p>
        </div>
        <span className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold", isDemo ? "border-warn/35 bg-warn/10 text-warn" : "border-good/35 bg-good/10 text-good")}>{isDemo ? "데모 프로젝트 · 변경 저장 안 됨" : "실제 프로젝트 문맥"}</span>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="시작 역할">
        {(Object.keys(ROLE_COPY) as JourneyRole[]).map((id) => <button key={id} type="button" role="tab" aria-selected={role === id} onClick={() => { setRole(id); setChecked(new Set()); }} className={cn("min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold", role === id ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}>{ROLE_COPY[id].label}</button>)}
      </div>
      <p className="mt-2 text-sm text-fg-2">{ROLE_COPY[role].description}</p>

      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        {steps.map((step, index) => <li key={step.title} className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-start gap-3"><button type="button" aria-pressed={checked.has(index)} onClick={() => toggle(index)} className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", checked.has(index) ? "border-good/35 bg-good/10 text-good" : "border-line bg-card text-fg-3")}><CheckCircle2 className="size-5" aria-hidden="true" /><span className="sr-only">{step.title} 완료 표시</span></button><div><p className="text-[0.625rem] font-black text-fg-3">{index + 1}단계 · 약 40초</p><h3 className="mt-1 font-black text-fg">{step.title}</h3><p className="mt-1 text-xs leading-5 text-fg-2">{step.detail}</p></div></div>
          {step.view ? <button type="button" onClick={() => onOpen(step.view!)} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 w-full justify-between" })}>실제 화면 열기 <ArrowRight className="size-4" aria-hidden="true" /></button> : step.href ? <Link to={step.href} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 w-full justify-between" })}>실제 화면 열기 <ExternalLink className="size-4" aria-hidden="true" /></Link> : <p className="mt-4 rounded-lg border border-line bg-card p-2 text-xs text-fg-3">현재 선택 원고에서 사용할 수 없습니다.</p>}
        </li>)}
      </ol>
    </section>
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="adoption-boundaries-title">
      <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-accent" aria-hidden="true" /><h2 id="adoption-boundaries-title" className="text-lg font-black text-fg">도입 전에 확인할 기능·비용·데이터 경계</h2></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          ["현재 원고", process ? `${process.label} · ${process.lifecyclePhase}` : "선택되지 않음"],
          ["외부 검토", candidate ? "고정 snapshot · 현재 권한 재검증" : "검수본 필요"],
          ["좌석·팀", "워크스페이스 운영 정책과 사용량 화면에서 확인"],
          ["저장", "로컬 저장·클라우드 revision·공식 전달을 별도 상태로 표시"],
          ["AI", "실행 전 공급자·외부 전송·예상 비용 확인"],
          ["데이터 반출", "CBZ 빠른 출력·manifest 공식 전달·원본 내보내기 분리"],
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.625rem] font-black text-fg-3">{label}</p><p className="mt-1 text-sm font-bold leading-5 text-fg">{value}</p></article>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpen("permissions")} className={buttonClass({ variant: "outline", size: "sm" })}><UserRound className="size-4" aria-hidden="true" /> 역할·권한 미리보기</button>
        <button type="button" onClick={() => onOpen("delivery")} className={buttonClass({ variant: "outline", size: "sm" })}><ExternalLink className="size-4" aria-hidden="true" /> 출력·전달 경계</button>
        <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2"><Clock3 className="size-4" aria-hidden="true" /> 체크 완료 {checked.size}/{steps.length}</span>
      </div>
    </section>
  </div>;
}
