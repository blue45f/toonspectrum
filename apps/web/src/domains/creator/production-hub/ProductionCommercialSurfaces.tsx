import {
  BriefcaseBusiness,
  Coins,
  FileKey2,
  MessagesSquare,
} from "lucide-react";

import {
  preflightCreditManifest,
  type ContractMilestone,
  type CreditManifest,
  type DeliveryRevision,
  type ProcurementProposal,
  type ProductionAgreement,
  type ProductionInvoice,
  type ProductionProjectAggregate,
  type RightsInterest,
  type RightsInterestType,
  type ScopePackage,
} from "@toonstudio/core/production";

import { hubText } from "./production-hub-text";
import type { BilingualLabel, ProductionLocalize } from "./production-labels";
import { formatProductionDay } from "./production-format";
import { ProductionEmptyState, ProductionMetric, ProductionPill, ProductionSectionCard } from "./production-ui";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function label<K extends string>(map: Readonly<Record<K, BilingualLabel>>, key: K, localize: ProductionLocalize): string {
  const entry = map[key];
  return entry ? localize(entry.ko, entry.en) : key;
}

const SCOPE_PACKAGE_STATUS: Readonly<Record<ScopePackage["status"], BilingualLabel>> = {
  draft: { ko: "초안", en: "Draft" },
  published: { ko: "공개됨", en: "Published" },
  superseded: { ko: "대체됨", en: "Superseded" },
  cancelled: { ko: "취소", en: "Cancelled" },
};

const PROPOSAL_STATUS: Readonly<Record<ProcurementProposal["status"], BilingualLabel>> = {
  draft: { ko: "작성 중", en: "Draft" },
  submitted: { ko: "접수됨", en: "Submitted" },
  clarification: { ko: "확인 질문", en: "Clarifying" },
  shortlisted: { ko: "후보", en: "Shortlisted" },
  selected: { ko: "선정", en: "Selected" },
  rejected: { ko: "미선정", en: "Not selected" },
  withdrawn: { ko: "철회", en: "Withdrawn" },
  expired: { ko: "만료", en: "Expired" },
};

const AGREEMENT_STATUS: Readonly<Record<ProductionAgreement["status"], BilingualLabel>> = {
  draft: { ko: "초안", en: "Draft" },
  "party-review": { ko: "당사자 검토", en: "Party review" },
  signed: { ko: "서명됨", en: "Signed" },
  active: { ko: "진행 중", en: "Active" },
  paused: { ko: "일시 중지", en: "Paused" },
  completed: { ko: "완료", en: "Completed" },
  terminated: { ko: "해지", en: "Terminated" },
  superseded: { ko: "대체됨", en: "Superseded" },
};

const MILESTONE_STATUS: Readonly<Record<ContractMilestone["status"], BilingualLabel>> = {
  "pending-input": { ko: "입력 대기", en: "Waiting for input" },
  ready: { ko: "시작 가능", en: "Ready" },
  "in-progress": { ko: "작업 중", en: "In progress" },
  submitted: { ko: "납품됨", en: "Submitted" },
  "changes-requested": { ko: "수정 요청", en: "Changes requested" },
  accepted: { ko: "검수 통과", en: "Accepted" },
  invoiced: { ko: "청구됨", en: "Invoiced" },
  paid: { ko: "지급 기록", en: "Paid" },
  cancelled: { ko: "취소", en: "Cancelled" },
};

const DELIVERY_STATUS: Readonly<Record<DeliveryRevision["status"], BilingualLabel>> = {
  draft: { ko: "초안", en: "Draft" },
  submitted: { ko: "제출됨", en: "Submitted" },
  "changes-requested": { ko: "수정 요청", en: "Changes requested" },
  accepted: { ko: "수락", en: "Accepted" },
  superseded: { ko: "대체됨", en: "Superseded" },
};

const INVOICE_STATUS: Readonly<Record<ProductionInvoice["status"], BilingualLabel>> = {
  draft: { ko: "초안", en: "Draft" },
  issued: { ko: "발행됨", en: "Issued" },
  verified: { ko: "확인됨", en: "Verified" },
  disputed: { ko: "이의 제기", en: "Disputed" },
  void: { ko: "무효", en: "Void" },
  settled: { ko: "정산 완료", en: "Settled" },
};

const CREDIT_STATUS: Readonly<Record<CreditManifest["status"], BilingualLabel>> = {
  draft: { ko: "초안", en: "Draft" },
  review: { ko: "검토 중", en: "In review" },
  approved: { ko: "승인됨", en: "Approved" },
  superseded: { ko: "대체됨", en: "Superseded" },
};

const RIGHTS_STATUS: Readonly<Record<RightsInterest["status"], BilingualLabel>> = {
  asserted: { ko: "주장됨", en: "Asserted" },
  "under-review": { ko: "검토 중", en: "Under review" },
  verified: { ko: "확인됨", en: "Verified" },
  disputed: { ko: "분쟁", en: "Disputed" },
  expired: { ko: "만료", en: "Expired" },
};

const RIGHTS_TYPE: Readonly<Record<RightsInterestType, BilingualLabel>> = {
  "authorship-claim": { ko: "저작자 표시", en: "Authorship" },
  "copyright-share": { ko: "저작권 지분", en: "Copyright share" },
  "publication-license": { ko: "연재 이용 허락", en: "Publication license" },
  "adaptation-license": { ko: "2차 저작 허락", en: "Adaptation license" },
  "secondary-use-consent": { ko: "부가 사용 동의", en: "Secondary use" },
  "portfolio-license": { ko: "포트폴리오 사용", en: "Portfolio use" },
  "ai-processing-consent": { ko: "AI 처리 동의", en: "AI processing consent" },
  "ai-training-consent": { ko: "AI 학습 동의", en: "AI training consent" },
};

export function ProductionProcurementSurface({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionProcurementSurface");
  const pendingPayments = aggregate.paymentRecords.filter((entry) => entry.status === "recorded-pending-verification");
  const activeAgreements = aggregate.agreements.filter((entry) => entry.status === "active" || entry.status === "signed");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProductionMetric label={hubText("공개 범위")} value={String(aggregate.scopePackages.filter((entry) => entry.status === "published").length)} detail={hubText("불변 ScopePackage")} icon={BriefcaseBusiness} tone="accent" />
        <ProductionMetric label={hubText("접수 제안")} value={String(aggregate.proposals.length)} detail={formatI18nTemplate(hubText("{v0}개 선정"), { v0: String(aggregate.proposals.filter((entry) => entry.status === "selected").length) })} icon={MessagesSquare} />
        <ProductionMetric label={hubText("활성 계약")} value={String(activeAgreements.length)} detail={formatI18nTemplate(hubText("{v0}개 마일스톤"), { v0: String(aggregate.contractMilestones.length) })} icon={FileKey2} tone="success" />
        <ProductionMetric label={hubText("지급 검증 대기")} value={String(pendingPayments.length)} detail={hubText("외부 증빙 전 지급 완료 아님")} icon={Coins} tone={pendingPayments.length > 0 ? "warning" : "success"} />
      </div>

      {aggregate.scopePackages.map((scopePackage) => {
        const proposals = aggregate.proposals.filter((entry) => entry.scopePackageId === scopePackage.id && entry.scopePackageRevision === scopePackage.revision);
        return (
          <ProductionSectionCard key={`${scopePackage.id}:${scopePackage.revision}`} title={bt(`외주 범위 · ${scopePackage.revision}번째 버전`, `Outsourcing scope · version ${scopePackage.revision}`)} description={bt(`내용이 바뀌면 새 버전으로 다시 공개합니다 · 확인값 ${scopePackage.digest.slice(0, 18)}…`, `Changes are published as a new version · checksum ${scopePackage.digest.slice(0, 18)}…`)} action={<ProductionPill tone={scopePackage.status === "published" ? "success" : "neutral"}>{label(SCOPE_PACKAGE_STATUS, scopePackage.status, bt)}</ProductionPill>}>
            <div className="grid gap-4 lg:grid-cols-[0.85fr_0.85fr_1.3fr]">
              <div><p className="text-xs font-bold text-fg">{hubText("산출물")}</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{scopePackage.deliverableSpecifications.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              <div><p className="text-xs font-bold text-fg">{hubText("완료 기준")}</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{scopePackage.acceptanceCriteria.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{hubText("일정·조건")}</p><dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-fg-2"><div><dt className="text-fg-3">{hubText("시작")}</dt><dd className="mt-1 font-semibold text-fg">{formatProductionDay(scopePackage.schedule.startsAt, bt("미정", "TBD"))}</dd></div><div><dt className="text-fg-3">{hubText("납기")}</dt><dd className="mt-1 font-semibold text-fg">{formatProductionDay(scopePackage.schedule.deliveryDueAt, bt("미정", "TBD"))}</dd></div><div><dt className="text-fg-3">{hubText("검수 SLA")}</dt><dd className="mt-1 font-semibold text-fg">{scopePackage.schedule.reviewResponseHours}h</dd></div><div><dt className="text-fg-3">{hubText("수정")}</dt><dd className="mt-1 font-semibold text-fg">{scopePackage.includedRevisionRounds}{hubText("회")}</dd></div></dl></div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-fg-3">{aggregate.parties.find((party) => party.id === proposal.proposerPartyId)?.publicDisplayName ?? proposal.proposerPartyId}</p><h3 className="mt-1 font-bold text-fg">{proposal.totalAmountMinor.toLocaleString("ko-KR")} {proposal.currency}</h3></div><ProductionPill tone={proposal.status === "selected" ? "success" : proposal.status === "rejected" ? "danger" : "warning"}>{label(PROPOSAL_STATUS, proposal.status, bt)}</ProductionPill></div>
                  <p className="mt-3 text-xs leading-5 text-fg-2">{proposal.understanding}</p>
                  <div className="mt-3 space-y-1.5">{proposal.milestoneDrafts.map((milestone) => <div key={milestone.title} className="flex justify-between rounded-lg bg-raised px-3 py-2 text-xs"><span className="text-fg-2">{milestone.title}</span><span className="font-semibold text-fg">{milestone.amountMinor.toLocaleString("ko-KR")}{hubText("원")}</span></div>)}</div>
                </article>
              ))}
              {proposals.length === 0 ? <ProductionEmptyState title={hubText("제안서가 없습니다")} description={hubText("범위 revision에 고정된 제안서를 접수해 가격·일정·수정 조건을 비교하세요.")} /> : null}
            </div>
          </ProductionSectionCard>
        );
      })}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ProductionSectionCard title={hubText("계약·마일스톤")} description={hubText("선택한 제안과 외주 범위 버전을 계약 내용으로 확정합니다.")}>
          <div className="space-y-3">
            {activeAgreements.map((agreement) => {
              const milestones = aggregate.contractMilestones.filter((entry) => entry.agreementId === agreement.id).sort((a, b) => a.sequence - b.sequence);
              return (
                <article key={agreement.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.6875rem] text-fg-3">{bt(`계약 ${agreement.revision}번째 버전`, `Contract version ${agreement.revision}`)}</p><h3 className="mt-1 font-bold text-fg">{agreement.totalAmountMinor.toLocaleString("ko-KR")} {agreement.currency}</h3></div><ProductionPill tone="success">{label(AGREEMENT_STATUS, agreement.status, bt)}</ProductionPill></div>
                  <div className="mt-4 space-y-2">{milestones.map((milestone) => <div key={milestone.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-raised p-3"><div className="flex size-8 items-center justify-center rounded-full bg-panel font-black text-accent">{milestone.sequence}</div><div><p className="text-xs font-semibold text-fg">{milestone.title}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{formatProductionDay(milestone.dueAt, bt("미정", "TBD"))} · {milestone.amountMinor.toLocaleString("ko-KR")}{hubText("원")}</p></div><ProductionPill tone={milestone.status === "paid" || milestone.status === "accepted" ? "success" : milestone.status === "changes-requested" ? "danger" : "warning"}>{label(MILESTONE_STATUS, milestone.status, bt)}</ProductionPill></div>)}</div>
                </article>
              );
            })}
          </div>
        </ProductionSectionCard>

        <ProductionSectionCard title={hubText("납품·청구·지급 증빙")} description={hubText("외부 결제의 참조와 증빙이 확인되기 전에는 지급 완료로 표시하지 않습니다.")}>
          <div className="space-y-2">
            {aggregate.deliveryRevisions.map((delivery) => <div key={delivery.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-fg">{bt(`납품 ${delivery.revision}차`, `Delivery ${delivery.revision}`)}</p><ProductionPill tone={delivery.status === "accepted" ? "success" : "warning"}>{label(DELIVERY_STATUS, delivery.status, bt)}</ProductionPill></div><p className="mt-2 text-[0.6875rem] text-fg-3">{bt(`제출물 ${delivery.submissionIds.length} · 라이선스 증빙 ${delivery.licenseEvidenceRefs.length} · AI 사용 기록 ${delivery.aiUseReceiptRefs.length}`, `Submissions ${delivery.submissionIds.length} · license evidence ${delivery.licenseEvidenceRefs.length} · AI receipts ${delivery.aiUseReceiptRefs.length}`)}</p></div>)}
            {aggregate.invoices.map((invoice) => {
              const payment = aggregate.paymentRecords.find((entry) => entry.invoiceId === invoice.id);
              return <div key={invoice.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-fg">{hubText("청구 ")}{invoice.amountMinor.toLocaleString("ko-KR")} {invoice.currency}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{invoice.externalInvoiceRef ?? hubText("외부 청구 참조 없음")}</p></div><ProductionPill tone={invoice.status === "settled" ? "success" : "warning"}>{label(INVOICE_STATUS, invoice.status, bt)}</ProductionPill></div>{payment ? <div className={cn("mt-3 rounded-lg border p-2.5 text-xs", payment.status === "verified-paid" ? "border-good/30 bg-good/10" : "border-warn/30 bg-warn/10")}><p className="font-semibold text-fg">{payment.status === "verified-paid" ? hubText("지급 검증 완료") : hubText("지급 기록 · 검증 대기")}</p><p className="mt-1 text-fg-2">{payment.externalPaymentRef ?? hubText("외부 결제 참조와 증빙이 아직 없습니다.")}</p></div> : null}</div>;
            })}
          </div>
        </ProductionSectionCard>
      </div>
    </div>
  );
}

export function ProductionRightsSurface({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionRightsSurface");
  const manifest = aggregate.creditManifests[0] ?? null;
  const preflight = preflightCreditManifest({
    manifest,
    contentRevisionRefs: manifest?.contentRevisionRefs ?? [],
    contributions: aggregate.contributions,
    rightsInterests: aggregate.rightsInterests,
    requiredApproverAssignmentIds: ["assignment-story", "assignment-art"],
  });
  const plan = aggregate.compensationPlans[0];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ProductionSectionCard title={bt("공개 크레딧", "Public credits")} description={hubText("실제로 공개할 파일 버전과 공개 크레딧을 함께 확정합니다.")}>
        {manifest ? <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3"><div><p className="text-xs text-fg-3">{hubText("상태")}</p><p className="mt-1 font-bold text-fg">{label(CREDIT_STATUS, manifest.status, bt)} · v{manifest.revision}</p></div><ProductionPill tone={preflight.passed ? "success" : "warning"}>{preflight.passed ? hubText("공개 준비 완료") : formatI18nTemplate(hubText("막힌 항목 {v0}"), { v0: String(preflight.blockers.length) })}</ProductionPill></div>
          {[...manifest.entries].sort((a, b) => a.order - b.order).map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3"><div className="flex size-9 items-center justify-center rounded-full bg-raised font-black text-accent">{entry.order}</div><div><p className="text-sm font-semibold text-fg">{entry.publicName}</p><p className="text-xs text-fg-2">{entry.roleLabel} · {entry.media.join(", ")}</p></div></div>)}
          {preflight.blockers.map((entry) => <p key={entry} className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-fg">{entry}</p>)}
          {preflight.warnings.map((entry) => <p key={entry} className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">{entry}</p>)}
        </div> : <ProductionEmptyState title={hubText("공개 크레딧 목록이 없습니다")} description={hubText("기여 기록과 계약 버전을 근거로 작성하세요.")} />}
      </ProductionSectionCard>

      <ProductionSectionCard title={hubText("권리·동의 원장")} description={hubText("AI 처리 동의와 AI 학습 동의를 별도 권리 항목으로 보존합니다.")}>
        <div className="space-y-2">
          {aggregate.rightsInterests.map((interest) => (
            <div key={interest.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3 text-xs">
              <ProductionPill tone={interest.status === "verified" ? "success" : interest.status === "disputed" ? "danger" : "warning"}>{label(RIGHTS_STATUS, interest.status, bt)}</ProductionPill>
              <span className="font-semibold text-fg">{label(RIGHTS_TYPE, interest.type, bt)}</span>
              <span className="text-fg-2">{aggregate.parties.find((party) => party.id === interest.partyId)?.publicDisplayName ?? interest.partyId}</span>
              <span className="ml-auto text-fg-3">{hubText("증빙 ")}{interest.evidenceRefs.length}</span>
            </div>
          ))}
        </div>
      </ProductionSectionCard>

      <ProductionSectionCard className="xl:col-span-2" title={hubText("보상·수익 배분")} description={hubText("기여 기록만으로 배분율이 바뀌지 않으며, 계약 버전에서만 확정됩니다.")}>
        {plan ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plan.revenueShareRules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-fg">{rule.revenueSource}</p><ProductionPill>{rule.basis}</ProductionPill></div>
              <div className="mt-3 space-y-2">
                {Object.entries(rule.partySharesBasisPoints).map(([partyId, value]) => <div key={partyId} className="flex justify-between text-xs"><span className="text-fg-2">{aggregate.parties.find((party) => party.id === partyId)?.publicDisplayName ?? partyId}</span><span className="font-semibold text-fg">{(value / 100).toFixed(1)}%</span></div>)}
              </div>
              {rule.deductions.length ? <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">{hubText("공제: ")}{rule.deductions.join(", ")}</p> : null}
            </div>
          ))}
        </div> : <ProductionEmptyState title={hubText("활성 보상 계획이 없습니다")} description={hubText("고정 대가와 수익원별 배분 기준을 계약 버전에 연결하세요.")} />}
      </ProductionSectionCard>
    </div>
  );
}
