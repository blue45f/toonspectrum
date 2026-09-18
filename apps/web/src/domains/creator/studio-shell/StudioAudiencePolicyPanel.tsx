import { AlertTriangle, BadgeCheck, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_CONTENT_ADVISORIES,
  audiencePolicyStorageKey,
  createStudioAudiencePolicy,
  evaluateStudioAudiencePolicy,
  type StudioAudiencePolicy,
  type StudioContentAdvisory,
} from "../studio-audience-policy";

const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function loadPolicy(projectId: string): StudioAudiencePolicy {
  if (typeof window === "undefined") return createStudioAudiencePolicy();
  try {
    const raw = window.localStorage.getItem(audiencePolicyStorageKey(projectId));
    if (!raw) return createStudioAudiencePolicy();
    const value = JSON.parse(raw) as Partial<StudioAudiencePolicy>;
    const rating = ["all", "12", "15", "19"].includes(value.rating ?? "") ? value.rating! : "all";
    const classification = ["general", "self-restricted", "officially-restricted", "unknown"].includes(
      value.restrictedMediaClassification ?? "",
    ) ? value.restrictedMediaClassification! : "unknown";
    const advisories = Array.isArray(value.advisories)
      ? value.advisories.filter((item): item is StudioContentAdvisory =>
        typeof item === "string" && STUDIO_CONTENT_ADVISORIES.includes(item as StudioContentAdvisory))
      : [];
    return {
      version: 1,
      rating,
      advisories,
      restrictedMediaClassification: classification,
      adultAccessGateEnabled: Boolean(value.adultAccessGateEnabled),
      identityVerificationRequired: Boolean(value.identityVerificationRequired),
      notes: String(value.notes ?? "").slice(0, 4000),
    };
  } catch {
    return createStudioAudiencePolicy();
  }
}

const ADVISORY_COPY: Readonly<Record<StudioContentAdvisory, readonly [string, string]>> = {
  violence: ["폭력", "Violence"],
  horror: ["공포", "Horror"],
  language: ["강한 언어", "Strong language"],
  "mature-theme": ["성인 주제", "Mature themes"],
  substance: ["음주·약물", "Substances"],
  gambling: ["도박", "Gambling"],
  "self-harm": ["자해 묘사", "Self-harm"],
};

const ISSUE_COPY: Readonly<Record<string, readonly [string, string]>> = {
  "official-restriction-rating-must-be-19": ["공식 제한 매체는 성인 등급으로 관리해야 합니다.", "Officially restricted media must use the adult rating."],
  "adult-access-gate-required": ["성인 접근 게이트가 필요합니다.", "An adult access gate is required."],
  "age-and-identity-verification-required": ["연령·본인 확인 절차가 필요합니다.", "Age and identity verification is required."],
  "classification-review-required": ["공개 전에 매체 분류를 확인하세요.", "Review the media classification before publishing."],
  "content-advisory-recommended": ["등급 사유를 독자가 알 수 있도록 주의 항목을 권장합니다.", "Add content advisories so readers understand the rating."],
};

export function StudioAudiencePolicyPanel({ projectId }: { readonly projectId: string }) {
  const bt = useBilingual("StudioAudiencePolicyPanel");
  const [policy, setPolicy] = useState(() => loadPolicy(projectId));

  useEffect(() => setPolicy(loadPolicy(projectId)), [projectId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(audiencePolicyStorageKey(projectId), JSON.stringify(policy));
    } catch {
      // Policy editing remains available even if the browser blocks persistence.
    }
  }, [policy, projectId]);

  const report = useMemo(() => evaluateStudioAudiencePolicy(policy), [policy]);
  const patch = (next: Partial<StudioAudiencePolicy>) => setPolicy((current) => ({ ...current, ...next }));
  const toggleAdvisory = (advisory: StudioContentAdvisory, checked: boolean) => {
    patch({
      advisories: checked
        ? [...new Set([...policy.advisories, advisory])]
        : policy.advisories.filter((item) => item !== advisory),
    });
  };

  const tone = report.status === "ready"
    ? "border-success/30 bg-success-soft/15 text-success"
    : report.status === "blocked"
      ? "border-danger/30 bg-danger-soft/15 text-danger"
      : "border-warning/30 bg-warning-soft/15 text-warning";

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="audience-policy-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <ShieldCheck size={15} aria-hidden="true" /> AUDIENCE & AGE POLICY
          </p>
          <h2 id="audience-policy-title" className="mt-2 text-xl font-black text-fg">
            {bt("독자 연령·콘텐츠 등급 공개 정책", "Audience age and content-rating policy")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {bt(
              "전체 서비스에 일괄 연령 인증을 강제하지 않고 작품별 등급을 기본으로 둡니다. 성인 제한 또는 공식 제한 매체로 분류되는 작품만 접근·확인 절차를 강화합니다.",
              "Use project-level ratings instead of forcing age verification across the whole service. Strengthen access and verification only for adult or officially restricted media.",
            )}
          </p>
        </div>
        <span className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-black", tone)}>
          {report.status === "ready" ? <BadgeCheck size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          {report.status === "ready"
            ? bt("공개 준비", "Ready")
            : report.status === "blocked"
              ? bt("공개 차단", "Blocked")
              : bt("검토 필요", "Review")}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-bold text-fg-2">
          {bt("작품 등급", "Project rating")}
          <select className={`${FIELD} mt-1`} value={policy.rating} onChange={(event) => patch({ rating: event.target.value as StudioAudiencePolicy["rating"] })}>
            <option value="all">{bt("전체 이용", "All audiences")}</option>
            <option value="12">12+</option>
            <option value="15">15+</option>
            <option value="19">19+</option>
          </select>
        </label>
        <label className="text-xs font-bold text-fg-2">
          {bt("매체 분류 상태", "Media classification")}
          <select className={`${FIELD} mt-1`} value={policy.restrictedMediaClassification} onChange={(event) => patch({ restrictedMediaClassification: event.target.value as StudioAudiencePolicy["restrictedMediaClassification"] })}>
            <option value="general">{bt("일반", "General")}</option>
            <option value="self-restricted">{bt("서비스 자체 성인 제한", "Service-restricted adult")}</option>
            <option value="officially-restricted">{bt("공식 제한 매체", "Officially restricted")}</option>
            <option value="unknown">{bt("판단 필요", "Needs review")}</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-bold text-fg-2">{bt("콘텐츠 주의 항목", "Content advisories")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STUDIO_CONTENT_ADVISORIES.map((advisory) => (
            <label key={advisory} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2">
              <input type="checkbox" checked={policy.advisories.includes(advisory)} onChange={(event) => toggleAdvisory(advisory, event.target.checked)} />
              {bt(...ADVISORY_COPY[advisory])}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <label className="flex min-h-14 items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2">
          <input className="mt-1.5" type="checkbox" checked={policy.adultAccessGateEnabled} onChange={(event) => patch({ adultAccessGateEnabled: event.target.checked })} />
          <span><b className="block text-fg">{bt("성인 접근 게이트", "Adult access gate")}</b>{bt("성인 제한 작품 진입 전에 등급 안내와 접근 확인을 거칩니다.", "Show rating and access confirmation before entering adult-restricted work.")}</span>
        </label>
        <label className="flex min-h-14 items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2">
          <input className="mt-1.5" type="checkbox" checked={policy.identityVerificationRequired} onChange={(event) => patch({ identityVerificationRequired: event.target.checked })} />
          <span><b className="block text-fg">{bt("연령·본인 확인 필요", "Age & identity verification")}</b>{bt("법적 또는 운영 정책상 본인 확인이 필요한 경우에만 활성화합니다.", "Enable only when legal or service policy requires verified identity.")}</span>
        </label>
      </div>

      <label className="mt-4 block text-xs font-bold text-fg-2">
        {bt("등급 판단 메모", "Classification notes")}
        <textarea className={cn(FIELD, "mt-1 min-h-20 resize-y")} maxLength={4000} value={policy.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder={bt("검토 근거, 외부 심의 결과, 담당자 메모", "Review basis, external classification result, owner notes")} />
      </label>

      {report.issues.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {report.issues.map((issue) => {
            const copy = ISSUE_COPY[issue] ?? [issue, issue];
            return <li key={issue} className="flex gap-2 rounded-xl border border-warning/25 bg-warning-soft/10 px-3 py-2 text-xs leading-5 text-fg-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" /><span>{bt(copy[0], copy[1])}</span></li>;
          })}
        </ul>
      ) : null}
      <p className="mt-4 text-[0.68rem] leading-5 text-fg-3">
        {bt("이 화면은 운영 준비용 메타데이터입니다. 실제 법적 지정·심의 여부와 본인확인 수단은 출시 국가의 법률·심의 결과 및 인증 공급자 설정을 기준으로 확정해야 합니다.", "This is operational metadata. Legal classification and identity-verification methods must be finalized against the launch jurisdiction and verification provider.")}
      </p>
    </section>
  );
}
