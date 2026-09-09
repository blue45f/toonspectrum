import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Settings2,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import { evaluateMarketProductionFit } from "../models/market-production-fit";
import { marketLicenseMeta } from "../models/market-kind";

import { MarketProductionProfileEditor } from "./MarketProductionProfileEditor";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketProductionFitWorkbenchProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
}

const STATUS_META = {
  ready: {
    label: "바로 사용 가능",
    icon: CheckCircle2,
    className: "border-good/35 bg-good/10 text-good",
  },
  review: {
    label: "사용 전 확인 필요",
    icon: CircleAlert,
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  blocked: {
    label: "현재 환경에서는 사용 어려움",
    icon: ShieldX,
    className: "border-danger/35 bg-danger/10 text-danger",
  },
} as const;

const CHECK_META = {
  pass: { label: "문제 없음", icon: CheckCircle2, className: "border-good/30 bg-good/10 text-good" },
  review: { label: "확인 필요", icon: CircleAlert, className: "border-warn/35 bg-warn/10 text-warn" },
  block: { label: "사용 불가", icon: ShieldX, className: "border-danger/35 bg-danger/10 text-danger" },
} as const;

export function MarketProductionFitWorkbench({ record, className }: MarketProductionFitWorkbenchProps) {
  const { profile, updateProfile, resetProfile, persistenceAvailable } = useMarketProductionProfile();
  const evaluation = evaluateMarketProductionFit(record, profile);
  const statusMeta = STATUS_META[evaluation.status];
  const StatusIcon = statusMeta.icon;
  const license = marketLicenseMeta(record.license);

  return (
    <section
      aria-labelledby="market-production-fit-title"
      className={cn("rounded-2xl border border-line bg-card p-4 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent">Before you use it</p>
          <h2 id="market-production-fit-title" className="mt-1 flex items-center gap-2 text-xl font-bold text-fg">
            <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
            이 리소스를 지금 쓸 수 있나요?
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-fg-3 sm:text-sm sm:leading-6">
            Studio 버전, 지원 엔진, 기기 환경과 사용권을 한 번에 확인합니다. 어려운 기술 정보를 직접 비교하지 않아도 됩니다.
          </p>
        </div>
        <span
          role="status"
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold", statusMeta.className)}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {statusMeta.label}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-panel p-3.5 sm:p-4">
        <p className="text-sm font-bold text-fg">{evaluation.headline}</p>
        <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm sm:leading-6">{evaluation.guidance}</p>
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.68rem] font-semibold"
          aria-label={`문제 없음 ${evaluation.passCount}개, 확인 필요 ${evaluation.reviewCount}개, 사용 불가 ${evaluation.blockCount}개`}
        >
          <span className="rounded-full bg-good/10 px-2.5 py-1 text-good">문제 없음 {evaluation.passCount}</span>
          {evaluation.reviewCount > 0 ? <span className="rounded-full bg-warn/10 px-2.5 py-1 text-warn">확인 필요 {evaluation.reviewCount}</span> : null}
          {evaluation.blockCount > 0 ? <span className="rounded-full bg-danger/10 px-2.5 py-1 text-danger">사용 불가 {evaluation.blockCount}</span> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Link href="/market/fit" className="inline-flex min-h-10 items-center rounded-xl border border-line bg-panel px-3 font-semibold text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
          내 환경에 맞는 리소스만 보기
        </Link>
        {license.url ? (
          <a href={license.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 font-semibold text-fg-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            사용권 원문 <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
        {record.provenance.origin === "permissive" ? (
          <a href={record.provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 font-semibold text-fg-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            원 출처 확인 <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <details className="group mt-4 rounded-xl border border-line bg-panel/55">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
          <Settings2 className="size-4 text-accent" aria-hidden="true" />
          세부 검사와 내 제작 환경 보기
          <span className="ml-auto text-[0.65rem] font-normal text-fg-3">전문 설정</span>
          <ChevronDown className="size-4 text-fg-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line p-3 sm:p-4">
          <p className="mb-3 text-xs leading-5 text-fg-3">
            아래 값은 서버 manifest와 브라우저에 저장한 제작 환경을 대조한 기술 상세입니다. 문제가 생길 때 원인을 확인하거나 전문 설정을 맞출 때 사용하세요.
          </p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="제작 적합성 세부 검사 결과">
              {evaluation.checks.map((check) => {
                const meta = CHECK_META[check.status];
                const Icon = meta.icon;
                return (
                  <li key={check.id} className="rounded-xl border border-line bg-card/65 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-fg">{check.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-fg-2">{check.summary}</p>
                      </div>
                      <span className={cn("inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[0.62rem] font-bold", meta.className)}>
                        <Icon className="size-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[0.62rem] font-semibold text-fg-3 hover:text-fg">기술 근거 보기</summary>
                      <p className="mt-1 break-words rounded-md bg-raised px-2 py-1.5 font-mono text-[0.62rem] leading-relaxed text-fg-3">{check.evidence}</p>
                    </details>
                  </li>
                );
              })}
            </ul>

            <MarketProductionProfileEditor
              profile={profile}
              onChange={updateProfile}
              onReset={resetProfile}
              persistenceAvailable={persistenceAvailable}
              className="bg-card/60 shadow-none"
            />
          </div>
        </div>
      </details>
    </section>
  );
}
