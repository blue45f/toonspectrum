import {
  AlertTriangle,
  Boxes,
  PanelTopOpen,
  ScrollText,
} from "lucide-react";

import type { AssetRequirement, DecisionAuthorityRule, ProductionProjectAggregate, ProductionRiskStatus } from "@toonstudio/core/production";

import { ProductionVisualPlanningWorkspace } from "./ProductionVisualPlanningWorkspace";
import type { ProductionClientCommand } from "./production-api";
import { hubEnText, hubText } from "./production-hub-text";
import { planningStatusLabel, productionAssignmentName, type BilingualLabel } from "./production-labels";
import { ProductionEmptyState, ProductionMetric, ProductionPill, ProductionSectionCard } from "./production-ui";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const AUTHORITY_DOMAINS = ["canon", "dialogue", "layout", "visual-direction", "color", "publication", "rights"] as const satisfies readonly DecisionAuthorityRule["domain"][];

const AUTHORITY_DOMAIN_LABELS: Readonly<Record<(typeof AUTHORITY_DOMAINS)[number], BilingualLabel>> = Object.freeze({
  canon: { ko: "설정·세계관", en: "Canon" },
  dialogue: { ko: "대사", en: "Dialogue" },
  layout: { ko: "컷 구성", en: "Layout" },
  "visual-direction": { ko: "시각 연출", en: "Visual direction" },
  color: { ko: "색", en: "Color" },
  publication: { ko: "게시", en: "Publication" },
  rights: { ko: "권리", en: "Rights" },
});

const ASSET_CATEGORY_LABELS: Readonly<Record<AssetRequirement["category"], BilingualLabel>> = Object.freeze({
  character: { ko: "캐릭터", en: "Character" },
  costume: { ko: "의상", en: "Costume" },
  location: { ko: "장소", en: "Location" },
  prop: { ko: "소품", en: "Prop" },
  "3d": { ko: "3D", en: "3D" },
  brush: { ko: "브러시", en: "Brush" },
  font: { ko: "글꼴", en: "Font" },
  audio: { ko: "소리", en: "Audio" },
  reference: { ko: "참고 자료", en: "Reference" },
  other: { ko: "기타", en: "Other" },
});

const ASSET_STATUS_LABELS: Readonly<Record<AssetRequirement["status"], BilingualLabel>> = Object.freeze({
  identified: { ko: "필요 확인", en: "Identified" },
  sourcing: { ko: "구하는 중", en: "Sourcing" },
  ready: { ko: "준비됨", en: "Ready" },
  blocked: { ko: "막힘", en: "Blocked" },
  cancelled: { ko: "취소", en: "Cancelled" },
});

const ASSET_SOURCING_LABELS: Readonly<Record<AssetRequirement["sourcing"], BilingualLabel>> = Object.freeze({
  internal: { ko: "내부 제작", en: "In-house" },
  external: { ko: "외주", en: "Outsourced" },
  marketplace: { ko: "마켓 구매", en: "Marketplace" },
  existing: { ko: "기존 자산", en: "Existing" },
});

const RISK_STATUS_LABELS: Readonly<Record<ProductionRiskStatus, BilingualLabel>> = Object.freeze({
  open: { ko: "열림", en: "Open" },
  monitoring: { ko: "지켜보는 중", en: "Monitoring" },
  mitigating: { ko: "대응 중", en: "Mitigating" },
  occurred: { ko: "발생함", en: "Occurred" },
  accepted: { ko: "감수함", en: "Accepted" },
  resolved: { ko: "해결됨", en: "Resolved" },
  dismissed: { ko: "제외됨", en: "Dismissed" },
  closed: { ko: "종료", en: "Closed" },
});

export function ProductionPlanningSurface({
  aggregate,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}) {
  const bt = useBilingual("ProductionPlanningSurface");
  const charter = [...aggregate.charters].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const brief = [...aggregate.projectBriefs].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const seriesMaster = [...aggregate.seriesMasters].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const season = [...aggregate.seasonPlans].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const openRisks = aggregate.risks.filter((risk) => ["open", "monitoring", "mitigating", "occurred"].includes(risk.status));
  const currentEpisodePlans = aggregate.episodePlans.filter((plan) => !aggregate.episodePlans.some((candidate) => candidate.episodeId === plan.episodeId && candidate.revision > plan.revision));
  const currentScenePlans = aggregate.scenePlans.filter((plan) => !aggregate.scenePlans.some((candidate) => candidate.sceneId === plan.sceneId && candidate.revision > plan.revision));
  const currentCutPlans = aggregate.cutPlans.filter((plan) => !aggregate.cutPlans.some((candidate) => candidate.cutId === plan.cutId && candidate.revision > plan.revision));
  return (
    <div className="space-y-4">
      <ProductionVisualPlanningWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProductionMetric label={hubText("기획 기준선")} value={brief ? `v${brief.revision}` : "—"} detail={brief ? planningStatusLabel(brief.status, bt) : hubText("작품 한눈에 보기 없음")} icon={ScrollText} tone={brief?.status === "approved" ? "success" : "warning"} />
        <ProductionMetric label={hubText("회차 계획")} value={String(currentEpisodePlans.length)} detail={formatI18nTemplate(hubEnText("{v0} scenes · {v1} cuts"), { v0: String(currentScenePlans.length), v1: String(currentCutPlans.length) })} icon={PanelTopOpen} tone="accent" />
        <ProductionMetric label={hubText("에셋 요구")} value={String(aggregate.assetRequirements.length)} detail={formatI18nTemplate(hubText("{v0}개 차단"), { v0: String(aggregate.assetRequirements.filter((entry) => entry.status === "blocked").length) })} icon={Boxes} />
        <ProductionMetric label={hubText("열린 위험")} value={String(openRisks.length)} detail={formatI18nTemplate(hubText("{v0}개 고위험"), { v0: String(openRisks.filter((entry) => entry.probability * entry.impact >= 12).length) })} icon={AlertTriangle} tone={openRisks.some((entry) => entry.probability * entry.impact >= 12) ? "danger" : "neutral"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ProductionSectionCard title={hubText("작품 한눈에 보기")} description={hubText("작품 목표·독자·공개 플랫폼·제약을 확인된 최신 버전으로 정리합니다.")}>
          {brief ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4">
                <div className="flex flex-wrap items-center gap-2"><ProductionPill tone="accent">{planningStatusLabel(brief.status, bt)}</ProductionPill><ProductionPill>{bt(`${brief.revision}번째 버전`, `Version ${brief.revision}`)}</ProductionPill></div>
                <h3 className="mt-3 text-lg font-black text-fg">{brief.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-fg">{brief.logline}</p>
                <p className="mt-2 text-xs leading-6 text-fg-2">{brief.synopsis}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{hubText("독자·장르")}</p><p className="mt-2 text-xs leading-5 text-fg-2">{[...brief.audience, ...brief.genreKeys].join(" · ")}</p></div>
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{hubText("사업·제약")}</p><p className="mt-2 text-xs leading-5 text-fg-2">{[...brief.businessGoals, ...brief.constraints].join(" · ")}</p></div>
              </div>
            </div>
          ) : <ProductionEmptyState title={hubText("작품 요약이 없습니다")} description={hubText("한 줄 소개, 독자, 공개 플랫폼과 권리 기준을 먼저 정해 주세요.")} />}
        </ProductionSectionCard>

        <ProductionSectionCard title={hubText("작품 공통 설정")} description={hubText("모든 회차가 함께 쓰는 세계·캐릭터·그림 스타일 기준입니다.")}>
          {seriesMaster ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3"><div><p className="text-xs text-fg-3">{hubText("작품 핵심")}</p><p className="mt-1 text-sm font-semibold leading-6 text-fg">{seriesMaster.premise}</p></div><ProductionPill tone="success">{planningStatusLabel(seriesMaster.status, bt)} · v{seriesMaster.revision}</ProductionPill></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{hubText("세계 규칙")}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{seriesMaster.worldRules.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{hubText("시각 규칙")}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{seriesMaster.styleRules.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              </div>
              {seriesMaster.forbiddenElements.length ? <div className="rounded-xl border border-bad/30 bg-bad/10 p-3"><p className="text-xs font-bold text-fg">{hubText("금지 요소")}</p><p className="mt-1 text-xs leading-5 text-fg-2">{seriesMaster.forbiddenElements.join(" · ")}</p></div> : null}
            </div>
          ) : <ProductionEmptyState title={hubText("작품 공통 설정이 없습니다")} description={hubText("캐릭터·장소·세계 규칙과 그림 기준을 하나의 최신 버전으로 정리하세요.")} />}
        </ProductionSectionCard>
      </div>

      <ProductionSectionCard title={season ? formatI18nTemplate(hubText("시즌 · {v0}"), { v0: String(season.title) }) : hubText("시즌·회차 기획")} description={season?.goal ?? hubText("시즌 목표와 회차별 리듬을 관리합니다.")} action={season ? <ProductionPill tone="success">{planningStatusLabel(season.status, bt)} · {season.targetEpisodeCount}{hubText("화")}</ProductionPill> : undefined}>
        <div className="grid gap-3 lg:grid-cols-2">
          {[...currentEpisodePlans].sort((a, b) => a.episodeNumber - b.episodeNumber).map((plan) => {
            const scenes = currentScenePlans.filter((entry) => entry.episodeId === plan.episodeId);
            const cuts = currentCutPlans.filter((entry) => entry.episodeId === plan.episodeId);
            return (
              <article key={plan.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">{hubEnText("EP ")}{plan.episodeNumber}</p><h3 className="mt-1 font-bold text-fg">{plan.title}</h3></div><ProductionPill tone={plan.status === "locked" || plan.status === "approved" ? "success" : "warning"}>{planningStatusLabel(plan.status, bt)} · v{plan.revision}</ProductionPill></div>
                <p className="mt-3 text-xs leading-5 text-fg-2">{plan.logline}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">{hubText("목표 컷")}</p><p className="mt-1 font-bold text-fg">{plan.targetCutCount}</p></div><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">{hubText("설계 장면")}</p><p className="mt-1 font-bold text-fg">{scenes.length}</p></div><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">{hubText("설계 컷")}</p><p className="mt-1 font-bold text-fg">{cuts.length}</p></div></div>
                <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">{hubEnText("Hook: ")}{plan.openingHook || hubText("작성 중")} {hubEnText("· Cliffhanger: ")}{plan.cliffhanger || hubText("작성 중")}</p>
              </article>
            );
          })}
        </div>
      </ProductionSectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ProductionSectionCard title={hubText("창작 합의")} description={hubText("함께 지킬 작품 기준과 각 창작자가 자유롭게 결정할 부분을 합의합니다.")}>
          {charter ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">{hubEnText("Core Experience")}</p><p className="mt-2 text-sm font-semibold leading-6 text-fg">{charter.coreExperience}</p></div>
              <div className="grid gap-2 md:grid-cols-2">{[["스토리 자율", charter.storyAutonomy], ["작화 자율", charter.artAutonomy], ["공동 결정", charter.jointDecisionAreas], ["피드백 원칙", charter.feedbackPrinciples]].map(([label, items]) => <div key={label as string} className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{label as string}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{(items as readonly string[]).map((item) => <li key={item}>• {item}</li>)}</ul></div>)}</div>
            </div>
          ) : <ProductionEmptyState title={hubText("창작 합의가 없습니다")} description={hubText("자율 영역, 함께 결정할 내용과 피드백 원칙을 합의해 주세요.")} />}
        </ProductionSectionCard>

        <ProductionSectionCard title={hubText("창작 결정권 매트릭스")} description={hubText("프로젝트 관리자 권한과 창작 최종결정권을 분리합니다.")}>
          <div className="overflow-x-auto"><table className="w-full min-w-[38rem] border-separate border-spacing-y-1 text-left text-xs"><thead className="text-fg-3"><tr><th className="px-3 py-2">{hubText("항목")}</th><th className="px-3 py-2">{hubText("제안")}</th><th className="px-3 py-2">{hubText("승인")}</th><th className="px-3 py-2">{hubText("최종 결정")}</th><th className="px-3 py-2">{hubText("거부 권한")}</th></tr></thead><tbody>{AUTHORITY_DOMAINS.map((domain) => { const rule = aggregate.authorityRules.find((entry) => entry.domain === domain); return <tr key={domain} className="bg-panel text-fg-2"><td className="rounded-l-xl px-3 py-2.5 font-semibold text-fg">{bt(AUTHORITY_DOMAIN_LABELS[domain].ko, AUTHORITY_DOMAIN_LABELS[domain].en)}</td><td className="px-3 py-2.5">{rule?.proposerAssignmentIds.map((id) => productionAssignmentName(aggregate, id)).join(", ") || "—"}</td><td className="px-3 py-2.5">{rule?.requiredApproverAssignmentIds.map((id) => productionAssignmentName(aggregate, id)).join(", ") || "—"}</td><td className="px-3 py-2.5">{rule?.decisionAssignmentId ? productionAssignmentName(aggregate, rule.decisionAssignmentId) : hubText("공동")}</td><td className="rounded-r-xl px-3 py-2.5">{rule?.vetoAssignmentIds.map((id) => productionAssignmentName(aggregate, id)).join(", ") || hubText("없음")}</td></tr>; })}</tbody></table></div>
        </ProductionSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProductionSectionCard title={hubText("에셋 요구사항")} description={hubText("기획 breakdown에서 내부 제작·외주·마켓 소싱으로 전환됩니다.")}>
          <div className="space-y-2">{aggregate.assetRequirements.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3"><ProductionPill>{bt(ASSET_CATEGORY_LABELS[entry.category].ko, ASSET_CATEGORY_LABELS[entry.category].en)}</ProductionPill><span className="font-semibold text-fg">{entry.title}</span><ProductionPill tone={entry.status === "ready" ? "success" : entry.status === "blocked" ? "danger" : "warning"}>{bt(ASSET_STATUS_LABELS[entry.status].ko, ASSET_STATUS_LABELS[entry.status].en)}</ProductionPill><span className="ml-auto text-xs text-fg-3">{bt(ASSET_SOURCING_LABELS[entry.sourcing].ko, ASSET_SOURCING_LABELS[entry.sourcing].en)}</span><p className="w-full text-xs leading-5 text-fg-2">{entry.specification}</p></div>)}</div>
        </ProductionSectionCard>
        <ProductionSectionCard title={hubText("위험·결정 원장")} description={hubText("위험 대응과 창작·운영 결정을 회차·장면 범위에 고정합니다.")}>
          <div className="space-y-2">{openRisks.map((risk) => <div key={risk.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center gap-2"><ProductionPill tone={risk.probability * risk.impact >= 12 ? "danger" : "warning"}>{bt(`가능성 ${risk.probability} × 영향 ${risk.impact}`, `Likelihood ${risk.probability} × impact ${risk.impact}`)}</ProductionPill><span className="font-semibold text-fg">{risk.title}</span><ProductionPill>{bt(RISK_STATUS_LABELS[risk.status].ko, RISK_STATUS_LABELS[risk.status].en)}</ProductionPill></div><p className="mt-2 text-xs leading-5 text-fg-2">{risk.mitigation}</p></div>)}</div>
        </ProductionSectionCard>
      </div>
    </div>
  );
}
