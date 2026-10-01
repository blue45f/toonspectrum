// 연령 정책 · 신인 발굴과 실무 지원 섹션.
import { Plus, ShieldCheck, UserRoundSearch } from "lucide-react";
import { useState } from "react";

import {
  creatorAgePolicy,
  type CreatorGrowthIpState,
  type CreatorSupportArea,
  type RookieCreatorProfile,
} from "../creator-growth-ip-model";
import {
  AGE_BAND_LABEL,
  AGE_BANDS,
  CAPABILITIES,
  CAPABILITY_LABEL,
  CREATOR_STAGE_LABEL,
  CREATOR_STAGES,
  DISCOVERY_STATUS_LABEL,
  SUPPORT_AREA_LABEL,
  SUPPORT_AREAS,
  SUPPORT_STATUS_LABEL,
} from "../growth-ip-labels";
import {
  bi,
  biLabel,
  GROWTH_CARD,
  GROWTH_INPUT,
  GROWTH_ITEM,
  GROWTH_PRIMARY,
  policyReason,
  safeExternalUrl,
  safeUuid,
  splitTags,
  type GrowthSectionProps,
} from "../growth-ip-shared";
import { EmptyNote, GrowthField, GrowthSection, Pill, PolicyBadge } from "../GrowthIpUi";

const RECENT_PROFILE_COUNT = 5;
const RECENT_REQUEST_COUNT = 6;

export function AgePolicySection({ state, update, notice }: GrowthSectionProps) {
  return (
    <GrowthSection
      id="age"
      icon={ShieldCheck}
      eyebrow="AGE-SAFE POLICY"
      title={bi("연령대별 기능 제한과 보호자 검토", "Age-aware capability policy")}
      description={bi("정확한 생년월일을 이 작업대에 저장하지 않고 연령대만 사용합니다. 지역별 법률 확정값이 아니라, 미성년자에게 계약·DM·성인 콘텐츠가 기본 개방되지 않도록 하는 제품 안전 기본값입니다.", "Only an age band is stored here, not a birth date. This is a product-safety baseline rather than a jurisdiction-specific legal determination.")}
      notice={notice}
    >
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className={GROWTH_CARD}>
          <GrowthField label={bi("연령대", "Age band")} hint={bi("실서비스에서는 국가/지역, 보호자 동의 증빙, 정책 버전을 별도 서버 정책으로 결합할 수 있습니다.", "Production can combine jurisdiction, guardian verification and policy versions server-side.")}>
            {(describedBy) => (
              <select
                className={GROWTH_INPUT}
                aria-describedby={describedBy}
                value={state.ageBand}
                onChange={(event) => {
                  const next = AGE_BANDS.find((band) => band === event.target.value);
                  if (next) update((current) => ({ ...current, ageBand: next }));
                }}
              >
                {AGE_BANDS.map((band) => <option key={band} value={band}>{biLabel(AGE_BAND_LABEL[band])}</option>)}
              </select>
            )}
          </GrowthField>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const decision = creatorAgePolicy(state.ageBand, capability);
            return (
              <article key={capability} className="rounded-xl border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-fg">{biLabel(CAPABILITY_LABEL[capability])}</strong>
                  <PolicyBadge allowed={decision.allowed} />
                </div>
                <p className="mt-2 text-xs leading-5 text-fg-2">{policyReason(decision)}</p>
                {decision.guardianRequired ? <p className="mt-2 text-[0.72rem] font-bold text-warn">{bi("보호자/법정대리인 검토 필요", "Guardian/legal-representative review required")}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </GrowthSection>
  );
}

const EMPTY_ROOKIE_DRAFT = { penName: "", stage: "rookie" as RookieCreatorProfile["stage"], genres: "", portfolioUrl: "", goal: "" };

function DiscoveryProfileCard({ state, update, notify }: Pick<GrowthSectionProps, "state" | "update" | "notify">) {
  const [draft, setDraft] = useState(EMPTY_ROOKIE_DRAFT);
  const publicProfilePolicy = creatorAgePolicy(state.ageBand, "public-profile");

  const save = () => {
    if (!draft.penName.trim()) {
      notify(bi("활동명/필명을 입력하세요.", "Enter a creator display name."));
      return;
    }
    const profile: RookieCreatorProfile = {
      id: safeUuid(),
      penName: draft.penName.trim().slice(0, 80),
      stage: draft.stage,
      genres: splitTags(draft.genres),
      portfolioUrl: safeExternalUrl(draft.portfolioUrl),
      goal: draft.goal.trim().slice(0, 800),
      discoveryStatus: publicProfilePolicy.allowed && !publicProfilePolicy.guardianRequired ? "discoverable" : "review",
    };
    update((current) => ({ ...current, rookieProfiles: [...current.rookieProfiles, profile].slice(-100) }));
    setDraft(EMPTY_ROOKIE_DRAFT);
    notify(publicProfilePolicy.guardianRequired
      ? bi("프로필을 검토 대기로 저장했습니다. 미성년 공개 프로필은 보호자/운영 검토를 거치도록 설계했습니다.", "Profile saved for review. Minor public profiles require guardian/operator review.")
      : bi("신인 작가 발굴 프로필을 저장했습니다.", "Creator discovery profile saved."));
  };

  return (
    <div className={GROWTH_CARD}>
      <h3 className="font-black text-fg">{bi("발굴 프로필", "Discovery profile")}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GrowthField label={bi("활동명 / 필명", "Display / pen name")}>
          <input className={GROWTH_INPUT} value={draft.penName} onChange={(e) => setDraft((c) => ({ ...c, penName: e.target.value }))} />
        </GrowthField>
        <GrowthField label={bi("활동 단계", "Stage")}>
          <select
            className={GROWTH_INPUT}
            value={draft.stage}
            onChange={(e) => {
              const stage = CREATOR_STAGES.find((item) => item === e.target.value);
              if (stage) setDraft((c) => ({ ...c, stage }));
            }}
          >
            {CREATOR_STAGES.map((stage) => <option key={stage} value={stage}>{biLabel(CREATOR_STAGE_LABEL[stage])}</option>)}
          </select>
        </GrowthField>
        <GrowthField label={bi("장르(쉼표로 구분)", "Genres (comma separated)")}>
          <input className={GROWTH_INPUT} value={draft.genres} onChange={(e) => setDraft((c) => ({ ...c, genres: e.target.value }))} placeholder={bi("로맨스, 판타지", "romance, fantasy")} />
        </GrowthField>
        <GrowthField label={bi("포트폴리오 주소", "Portfolio URL")}>
          <input className={GROWTH_INPUT} type="url" inputMode="url" value={draft.portfolioUrl} onChange={(e) => setDraft((c) => ({ ...c, portfolioUrl: e.target.value }))} placeholder="https://" />
        </GrowthField>
      </div>
      <GrowthField className="mt-3" label={bi("성장 목표·찾는 기회", "Growth goal and opportunities sought")}>
        <textarea className={`${GROWTH_INPUT} min-h-24`} value={draft.goal} onChange={(e) => setDraft((c) => ({ ...c, goal: e.target.value }))} />
      </GrowthField>
      <button type="button" className={`${GROWTH_PRIMARY} mt-3`} onClick={save}><Plus size={15} aria-hidden />{bi("프로필 저장", "Save profile")}</button>
      <div className="mt-4 grid gap-2">
        {state.rookieProfiles.length ? state.rookieProfiles.slice(-RECENT_PROFILE_COUNT).reverse().map((profile) => (
          <article key={profile.id} className={GROWTH_ITEM}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-fg">{profile.penName}</strong>
              <Pill>{biLabel(CREATOR_STAGE_LABEL[profile.stage])}</Pill>
              <Pill tone="accent">{biLabel(DISCOVERY_STATUS_LABEL[profile.discoveryStatus])}</Pill>
            </div>
            <p className="mt-2 text-xs text-fg-2">{profile.genres.join(" · ") || bi("장르 미입력", "No genres")}{profile.goal ? ` · ${profile.goal}` : ""}</p>
          </article>
        )) : <EmptyNote>{bi("저장한 발굴 프로필이 없습니다.", "No discovery profiles yet.")}</EmptyNote>}
      </div>
    </div>
  );
}

function SupportRequestCard({ state, update, notify }: Pick<GrowthSectionProps, "state" | "update" | "notify">) {
  const [draft, setDraft] = useState({ area: "mentoring" as CreatorSupportArea, title: "", detail: "" });

  const submit = () => {
    if (!draft.title.trim()) {
      notify(bi("지원 요청 제목을 입력하세요.", "Enter a support request title."));
      return;
    }
    const request: CreatorGrowthIpState["supportRequests"][number] = {
      id: safeUuid(),
      area: draft.area,
      title: draft.title.trim().slice(0, 160),
      detail: draft.detail.trim().slice(0, 3000),
      status: "requested",
      createdAt: new Date().toISOString(),
    };
    update((current) => ({ ...current, supportRequests: [...current.supportRequests, request].slice(-200) }));
    setDraft((current) => ({ ...current, title: "", detail: "" }));
    notify(bi("지원 요청을 등록했습니다. 자동 계약이나 결제는 발생하지 않습니다.", "Support request saved. No contract or payment is executed automatically."));
  };

  return (
    <div className={GROWTH_CARD}>
      <h3 className="font-black text-fg">{bi("서포트 요청", "Support request")}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-[11rem_1fr]">
        <GrowthField label={bi("지원 분야", "Area")}>
          <select
            className={GROWTH_INPUT}
            value={draft.area}
            onChange={(e) => {
              const area = SUPPORT_AREAS.find((item) => item === e.target.value);
              if (area) setDraft((c) => ({ ...c, area }));
            }}
          >
            {SUPPORT_AREAS.map((area) => <option key={area} value={area}>{biLabel(SUPPORT_AREA_LABEL[area])}</option>)}
          </select>
        </GrowthField>
        <GrowthField label={bi("필요한 지원 한 줄 요약", "One-line support need")}>
          <input className={GROWTH_INPUT} value={draft.title} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} />
        </GrowthField>
      </div>
      <GrowthField className="mt-3" label={bi("자세한 상황", "Details")} hint={bi("상황·마감·예상 산출물을 적고 민감정보는 빼 주세요.", "Context, deadline and deliverables; omit sensitive data.")}>
        {(describedBy) => (
          <textarea className={`${GROWTH_INPUT} min-h-28`} aria-describedby={describedBy} value={draft.detail} onChange={(e) => setDraft((c) => ({ ...c, detail: e.target.value }))} />
        )}
      </GrowthField>
      <button type="button" className={`${GROWTH_PRIMARY} mt-3`} onClick={submit}><Plus size={15} aria-hidden />{bi("요청 등록", "Add request")}</button>
      <ul className="mt-4 grid gap-2">
        {state.supportRequests.length ? state.supportRequests.slice(-RECENT_REQUEST_COUNT).reverse().map((request) => (
          <li key={request.id} className={GROWTH_ITEM}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-fg">{request.title}</strong>
              <span className="text-[0.72rem] font-bold text-fg-2">{biLabel(SUPPORT_AREA_LABEL[request.area])} · {biLabel(SUPPORT_STATUS_LABEL[request.status])}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">{request.detail || "—"}</p>
          </li>
        )) : <li><EmptyNote>{bi("등록한 지원 요청이 없습니다.", "No support requests yet.")}</EmptyNote></li>}
      </ul>
    </div>
  );
}

export function DiscoverySupportSection({ state, update, notify, notice }: GrowthSectionProps) {
  return (
    <GrowthSection
      id="support"
      icon={UserRoundSearch}
      eyebrow="DISCOVERY & SUPPORT"
      title={bi("신인 작가 발굴과 실무 지원", "Rookie creator discovery and practical support")}
      description={bi("학생·신인·독립작가가 공개 범위를 통제하면서 포트폴리오와 성장 목표를 기록하고, 멘토링·편집·법무·세무·번역·마케팅·연재 준비 지원을 요청할 수 있습니다.", "Creators can control discovery visibility while recording portfolio goals and requesting mentoring, editorial, legal, tax, localization, marketing and publishing support.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <DiscoveryProfileCard state={state} update={update} notify={notify} />
        <SupportRequestCard state={state} update={update} notify={notify} />
      </div>
    </GrowthSection>
  );
}
