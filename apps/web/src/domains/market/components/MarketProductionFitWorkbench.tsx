import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import {
  evaluateMarketProductionFit,
} from "../models/market-production-fit";
import { marketLicenseMeta } from "../models/market-kind";

import { MarketProductionProfileEditor } from "./MarketProductionProfileEditor";

import type {
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketProductionFitWorkbenchProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
}

const STATUS_META = {
  ready: {
    label: "제작 조건 일치",
    icon: CheckCircle2,
    className: "border-good/35 bg-good/10 text-good",
  },
  review: {
    label: "적용 전 확인",
    icon: CircleAlert,
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  blocked: {
    label: "현재 조건 차단",
    icon: ShieldX,
    className: "border-danger/35 bg-danger/10 text-danger",
  },
} as const;

const CHECK_META = {
  pass: {
    label: "충족",
    icon: CheckCircle2,
    className: "border-good/30 bg-good/10 text-good",
  },
  review: {
    label: "확인",
    icon: CircleAlert,
    className: "border-warn/35 bg-warn/10 text-warn",
  },
  block: {
    label: "차단",
    icon: ShieldX,
    className: "border-danger/35 bg-danger/10 text-danger",
  },
} as const;

export function MarketProductionFitWorkbench({
  record,
  className,
}: MarketProductionFitWorkbenchProps) {
  const {
    profile,
    updateProfile,
    resetProfile,
    persistenceAvailable,
  } = useMarketProductionProfile();
  const evaluation = evaluateMarketProductionFit(record, profile);
  const statusMeta = STATUS_META[evaluation.status];
  const StatusIcon = statusMeta.icon;
  const license = marketLicenseMeta(record.license);

  return (
    <section
      aria-labelledby="market-production-fit-title"
      className={cn(
        "rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Manifest preflight</p>
          <h2
            id="market-production-fit-title"
            className="mt-1 flex items-center gap-2 text-xl font-bold text-fg"
          >
            <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
            제작 적합성 패스포트
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">
            서버가 제공한 리소스 manifest와 이 브라우저에 선언한 제작 조건을 대조합니다.
            이 결과는 구매 완료, 설치 성공, 실제 기기 성능 또는 법률 자문을 의미하지 않습니다.
          </p>
        </div>
        <span
          role="status"
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
            statusMeta.className,
          )}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {statusMeta.label}
        </span>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
        <div>
          <div className="rounded-xl border border-line bg-panel p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-fg">{evaluation.headline}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
                  {evaluation.guidance}
                </p>
              </div>
              <div
                className="flex items-center gap-1.5 text-[0.68rem] font-semibold"
                aria-label={`충족 ${evaluation.passCount}개, 확인 ${evaluation.reviewCount}개, 차단 ${evaluation.blockCount}개`}
              >
                <span className="rounded bg-good/10 px-2 py-1 text-good">
                  충족 {evaluation.passCount}
                </span>
                <span className="rounded bg-warn/10 px-2 py-1 text-warn">
                  확인 {evaluation.reviewCount}
                </span>
                <span className="rounded bg-danger/10 px-2 py-1 text-danger">
                  차단 {evaluation.blockCount}
                </span>
              </div>
            </div>
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="제작 적합성 검사 결과">
            {evaluation.checks.map((check) => {
              const meta = CHECK_META[check.status];
              const Icon = meta.icon;
              return (
                <li
                  key={check.id}
                  className="rounded-xl border border-line bg-panel/55 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-fg">{check.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-fg-2">
                        {check.summary}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[0.62rem] font-bold",
                        meta.className,
                      )}
                    >
                      <Icon className="size-3" aria-hidden="true" />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 break-words rounded-md bg-raised px-2 py-1.5 font-mono text-[0.62rem] leading-relaxed text-fg-3">
                    {check.evidence}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/market/fit"
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-panel px-3 font-semibold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
            >
              전체 마켓을 제작 조건으로 정렬
            </Link>
            {license.url ? (
              <a
                href={license.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-semibold text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
              >
                사용권 원문
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {record.provenance.origin === "permissive" ? (
              <a
                href={record.provenance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-semibold text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
              >
                원 출처 확인
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>

        <MarketProductionProfileEditor
          profile={profile}
          onChange={updateProfile}
          onReset={resetProfile}
          persistenceAvailable={persistenceAvailable}
          className="bg-panel/70 shadow-none"
        />
      </div>
    </section>
  );
}
