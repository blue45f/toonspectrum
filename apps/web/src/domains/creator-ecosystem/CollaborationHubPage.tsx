import { Brush, Building2, CheckCircle2, Inbox, Search, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

import {
  COLLABORATION_TYPES,
  COLLABORATION_TYPE_LABELS,
} from "@/shared/lib/types";
import { api, getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

import type {
  BusinessVerificationStatus,
  CollaborationProposalStatus,
  CollaborationType,
} from "@/shared/lib/types";

const SCOPE = "domains.creator-ecosystem.CollaborationHubPage";

const COLLABORATION_TYPE_EN: Record<CollaborationType, string> = {
  goods: "Goods · merch",
  video: "Video · short-form",
  brand: "Brand collab",
  advertising: "Ads · branded webtoon",
  publishing: "Publishing · print",
  animation: "Animation",
  game: "Game · interactive",
  popup_event: "Pop-up · exhibition · event",
  overseas_license: "Overseas license",
  adaptation: "Film · drama adaptation",
  other: "Other · IP collab",
};

const PROPOSAL_STATUS_EN: Record<CollaborationProposalStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const VERIFICATION_EN: Record<BusinessVerificationStatus, string> = {
  draft: "Draft",
  pending: "Under review",
  verified: "Verified",
  rejected: "Needs revision",
};

interface CreatorDirectoryItem {
  userId: string;
  name: string;
  avatar: string | null;
  acceptedTypes: CollaborationType[];
  acceptUnverified: boolean;
  note: string;
}

interface Preference {
  discoverable: boolean;
  acceptedTypes: CollaborationType[];
  acceptUnverified: boolean;
  note: string;
}

interface BusinessProfile {
  organization: string;
  website: string;
  contactEmail: string;
  evidenceNote: string;
  verificationStatus: BusinessVerificationStatus;
  reviewNote?: string;
}

interface Proposal {
  id: string;
  senderId: string;
  targetCreatorId: string;
  type: CollaborationType;
  organization: string;
  contactEmail: string;
  senderVerificationStatus: BusinessVerificationStatus;
  title: string;
  summary: string;
  budgetMinWon: number;
  budgetMaxWon: number;
  currency: string;
  territories: string[];
  exclusive: boolean;
  durationMonths: number;
  projectUrl: string;
  rightsRequested: string[];
  status: CollaborationProposalStatus;
  createdAt: string;
  sender?: { id: string; name: string | null; avatar: string | null } | null;
  targetCreator?: { id: string; name: string | null; avatar: string | null } | null;
}

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-bold transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg";
const TEXTAREA = "w-full rounded-xl border border-line bg-canvas px-3 py-3 text-sm text-fg";

const PROPOSAL_STATUS_KO: Record<CollaborationProposalStatus, string> = {
  new: "신규",
  reviewing: "검토 중",
  accepted: "수락",
  declined: "거절",
  withdrawn: "철회",
};

const VERIFICATION_KO: Record<BusinessVerificationStatus, string> = {
  draft: "작성 중",
  pending: "인증 검토 중",
  verified: "인증 완료",
  rejected: "보완 필요",
};

const EMPTY_PREFERENCE: Preference = {
  discoverable: false,
  acceptedTypes: [],
  acceptUnverified: false,
  note: "",
};

const EMPTY_BUSINESS: BusinessProfile = {
  organization: "",
  website: "",
  contactEmail: "",
  evidenceNote: "",
  verificationStatus: "draft",
};

function money(value: number, negotiated: string): string {
  if (!value) return negotiated;
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

export function CollaborationHubPage() {
  const bt = useBilingual(SCOPE);
  const userId = useApp((state) => state.userId);
  const [creators, setCreators] = useState<CreatorDirectoryItem[]>([]);
  const [preference, setPreference] = useState<Preference>(EMPTY_PREFERENCE);
  const [business, setBusiness] = useState<BusinessProfile>(EMPTY_BUSINESS);
  const [inbox, setInbox] = useState<Proposal[]>([]);
  const [sent, setSent] = useState<Proposal[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState("");
  const [proposalType, setProposalType] = useState<CollaborationType>("goods");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalSummary, setProposalSummary] = useState("");
  const [budgetMin, setBudgetMin] = useState("0");
  const [budgetMax, setBudgetMax] = useState("0");
  const [territories, setTerritories] = useState(bt("대한민국", "South Korea"));
  const [rightsRequested, setRightsRequested] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [exclusive, setExclusive] = useState(false);
  const [projectUrl, setProjectUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const typeLabel = (type: CollaborationType) => bt(COLLABORATION_TYPE_LABELS[type], COLLABORATION_TYPE_EN[type]);

  const selectedCreator = useMemo(
    () => creators.find((item) => item.userId === selectedCreatorId) ?? null,
    [creators, selectedCreatorId],
  );

  const refreshPublicCreators = useCallback(async () => {
    try {
      const result = await api.get<{ items: CreatorDirectoryItem[] }>(
        "/creator-ecosystem/collaboration/creators",
      );
      setCreators(result.items);
      setSelectedCreatorId((current) => current || result.items[0]?.userId || "");
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "협업 가능한 작가를 불러오지 못했어요."));
    }
  }, []);

  const refreshPrivate = useCallback(async () => {
    if (!userId) return;
    try {
      const [prefResult, businessResult, inboxResult, sentResult] = await Promise.all([
        api.get<{ item: Preference }>("/creator-ecosystem/collaboration/me/preferences"),
        api.get<{ item: BusinessProfile | null }>("/creator-ecosystem/collaboration/me/business-profile"),
        api.get<{ items: Proposal[] }>("/creator-ecosystem/collaboration/me/inbox"),
        api.get<{ items: Proposal[] }>("/creator-ecosystem/collaboration/me/sent"),
      ]);
      setPreference(prefResult.item ?? EMPTY_PREFERENCE);
      setBusiness(businessResult.item ?? EMPTY_BUSINESS);
      setInbox(inboxResult.items);
      setSent(sentResult.items);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "협업 설정을 불러오지 못했어요."));
    }
  }, [userId]);

  useEffect(() => {
    void refreshPublicCreators();
  }, [refreshPublicCreators]);

  useEffect(() => {
    void refreshPrivate();
  }, [refreshPrivate]);

  function toggleAcceptedType(type: CollaborationType) {
    setPreference((current) => ({
      ...current,
      acceptedTypes: current.acceptedTypes.includes(type)
        ? current.acceptedTypes.filter((item) => item !== type)
        : [...current.acceptedTypes, type],
    }));
  }

  async function savePreference() {
    setBusy("preference");
    setError("");
    try {
      const result = await api.put<{ item: Preference }>(
        "/creator-ecosystem/collaboration/me/preferences",
        preference,
      );
      setPreference(result.item);
      setNotice(bt("제안 수신 설정을 저장했습니다.", "Saved your proposal receiving settings."));
      await refreshPublicCreators();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("제안 수신 설정을 저장하지 못했어요.", "Couldn't save your proposal receiving settings.")));
    } finally {
      setBusy("");
    }
  }

  async function saveBusiness() {
    setBusy("business");
    setError("");
    try {
      const result = await api.put<{ item: BusinessProfile }>(
        "/creator-ecosystem/collaboration/me/business-profile",
        { ...business, consentAccepted: true },
      );
      setBusiness(result.item);
      setNotice(bt("기업·단체 정보를 저장했습니다. 변경된 정보는 다시 인증이 필요합니다.", "Saved your organization info. Changed info needs re-verification."));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("기업·단체 정보를 저장하지 못했어요.", "Couldn't save your organization info.")));
    } finally {
      setBusy("");
    }
  }

  async function submitVerification() {
    setBusy("verify");
    setError("");
    try {
      const result = await api.post<{ item: BusinessProfile }>(
        "/creator-ecosystem/collaboration/me/business-profile/submit-verification",
      );
      setBusiness(result.item);
      setNotice(bt("기업 인증 검토를 요청했습니다.", "Requested business verification review."));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("기업 인증 요청을 처리하지 못했어요.", "Couldn't process the verification request.")));
    } finally {
      setBusy("");
    }
  }

  async function sendProposal() {
    if (!selectedCreator) {
      setError(bt("제안을 받을 작가를 선택해 주세요.", "Choose a creator to send the proposal to."));
      return;
    }
    setBusy("proposal");
    setError("");
    try {
      await api.post("/creator-ecosystem/collaboration/proposals", {
        targetCreatorId: selectedCreator.userId,
        type: proposalType,
        title: proposalTitle,
        summary: proposalSummary,
        budgetMinWon: Number(budgetMin || 0),
        budgetMaxWon: Number(budgetMax || 0),
        currency: "KRW",
        territories: territories.split(",").map((value) => value.trim()).filter(Boolean),
        exclusive,
        durationMonths: Number(durationMonths || 0),
        projectUrl,
        rightsRequested: rightsRequested.split(",").map((value) => value.trim()).filter(Boolean),
        consentAccepted: true,
      });
      setProposalTitle("");
      setProposalSummary("");
      setRightsRequested("");
      setProjectUrl("");
      setNotice(bt("협업 제안을 전송했습니다.", "Sent the collaboration proposal."));
      await refreshPrivate();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("협업 제안을 보내지 못했어요.", "Couldn't send the collaboration proposal.")));
    } finally {
      setBusy("");
    }
  }

  async function changeProposalStatus(id: string, status: CollaborationProposalStatus) {
    setBusy(id);
    setError("");
    try {
      await api.patch(`/creator-ecosystem/collaboration/proposals/${id}/status`, { status });
      await refreshPrivate();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("제안 상태를 변경하지 못했어요.", "Couldn't change the proposal status.")));
    } finally {
      setBusy("");
    }
  }

  return (
    <CreatorEcosystemLayout
      title={bt("작가 IP 협업 · 협찬", "Creator IP collaboration · sponsorship")}
      intro={bt(
        "굿즈·영상·브랜드·출판·애니메이션·게임·판권 제안을 구조화합니다. 작가는 받을 제안 범위와 미인증 제안 허용 여부를 직접 정하고, 기업은 인증 상태와 예산·권리 범위를 명시해 제안합니다.",
        "Structured proposals for goods, video, brand, publishing, animation, game, and licensing deals. Creators set which proposal types and unverified senders they accept; businesses state verification, budget, and rights up front.",
      )}
    >
      {!userId ? (
        <div className="rounded-2xl border border-line bg-panel p-5 text-sm leading-6 text-fg-2">
          {bt(
            "작가 제안 설정, 기업 인증, 제안 송수신은 로그인 후 사용할 수 있습니다. 공개된 협업 가능 작가 목록은 아래에서 확인할 수 있습니다.",
            "Proposal settings, business verification, and sending/receiving proposals need sign-in. The public creator directory is listed below.",
          )}
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Brush size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-xl font-black">{bt("실시간 공동 캔버스", "Live co-drawing canvas")}</h2>
              <p className="mt-1 text-sm leading-6 text-fg-2">
                {bt(
                  "제안을 주고받기 전에, 같은 캔버스에서 함께 그려 보세요. 캔버스를 열면 라이브 세션이 시작되고, 열린 화면의 주소를 동료에게 보내면 같은 캔버스에 바로 들어옵니다.",
                  "Before proposals go back and forth, try drawing together on one canvas. Opening the canvas starts a live session — share the opened page's address and your collaborators join the same canvas right away.",
                )}
              </p>
            </div>
          </div>
          <Link to="/studio/canvas" className={`${BUTTON} shrink-0 bg-accent text-on-accent`}>
            {bt("공동 캔버스 열기", "Open the co-drawing canvas")}
          </Link>
        </div>
      </section>

      {userId ? (
        <section id="collab-preference" className="grid gap-5 xl:grid-cols-2">
          <article className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2">
              <Inbox size={20} className="text-accent" aria-hidden="true" />
              <h2 className="text-xl font-black">{bt("작가 제안 수신 설정", "Creator proposal settings")}</h2>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={preference.discoverable}
                onChange={(event) => setPreference((value) => ({ ...value, discoverable: event.target.checked }))}
              />
              {bt("협업 가능 작가 목록에 내 프로필 공개", "List my profile in the open creator directory")}
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {COLLABORATION_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={preference.acceptedTypes.includes(type)}
                    onChange={() => toggleAcceptedType(type)}
                  />
                  {typeLabel(type)}
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={preference.acceptUnverified}
                onChange={(event) => setPreference((value) => ({ ...value, acceptUnverified: event.target.checked }))}
              />
              <span>
                {bt("미인증 기업·단체의 제안도 허용", "Also allow proposals from unverified organizations")}
                <span className="mt-1 block text-xs text-fg-3">{bt("기본값은 인증된 제안만 허용하는 것이 안전합니다.", "Safest default: only allow verified proposals.")}</span>
              </span>
            </label>
            <textarea
              className={`${TEXTAREA} mt-4 min-h-24`}
              value={preference.note}
              maxLength={500}
              onChange={(event) => setPreference((value) => ({ ...value, note: event.target.value }))}
              placeholder={bt("예: 국내 굿즈, 비독점 콜라보 우선 검토", "E.g. domestic goods, non-exclusive collabs preferred")}
            />
            <button
              type="button"
              className={`${BUTTON} mt-4 bg-accent text-on-accent`}
              disabled={busy === "preference"}
              onClick={() => void savePreference()}
            >
              {bt("수신 설정 저장", "Save settings")}
            </button>
          </article>

          <article className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 size={20} className="text-accent" aria-hidden="true" />
                <h2 className="text-xl font-black">{bt("기업 · 단체 인증", "Business · organization verification")}</h2>
              </div>
              <span className="rounded-full bg-raised px-3 py-1 text-xs font-bold">
                {bt(VERIFICATION_KO[business.verificationStatus], VERIFICATION_EN[business.verificationStatus])}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              <input
                className={INPUT}
                value={business.organization}
                onChange={(event) => setBusiness((value) => ({ ...value, organization: event.target.value }))}
                placeholder={bt("기업·단체명", "Organization name")}
              />
              <input
                className={INPUT}
                type="url"
                value={business.website}
                onChange={(event) => setBusiness((value) => ({ ...value, website: event.target.value }))}
                placeholder={bt("https:// 공식 웹사이트", "https:// official website")}
              />
              <input
                className={INPUT}
                type="email"
                value={business.contactEmail}
                onChange={(event) => setBusiness((value) => ({ ...value, contactEmail: event.target.value }))}
                placeholder={bt("업무용 이메일", "Work email")}
              />
              <textarea
                className={`${TEXTAREA} min-h-28`}
                value={business.evidenceNote}
                onChange={(event) => setBusiness((value) => ({ ...value, evidenceNote: event.target.value }))}
                placeholder={bt("사업 분야, 담당 조직, 확인 가능한 공개 정보 등을 적어 주세요.", "Business field, responsible team, verifiable public info, etc.")}
              />
            </div>
            {business.reviewNote ? (
              <p className="mt-3 rounded-xl bg-raised p-3 text-xs text-fg-2">{bt("검토 메모", "Review note")}: {business.reviewNote}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={busy === "business"}
                onClick={() => void saveBusiness()}
              >
                {bt("정보 저장", "Save info")}
              </button>
              <button
                type="button"
                className={`${BUTTON} border-accent text-accent`}
                disabled={busy === "verify" || business.verificationStatus === "pending" || business.verificationStatus === "verified"}
                onClick={() => void submitVerification()}
              >
                <ShieldCheck size={16} className="mr-1" aria-hidden="true" />
                {bt("인증 요청", "Request verification")}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="text-xl font-black">{bt("협업 가능한 작가", "Open for collaboration")}</h2>
        <p className="mt-2 text-sm text-fg-2">{bt("작가가 직접 공개하고 제안 유형을 선택한 프로필만 표시합니다.", "Only profiles creators published themselves, with their chosen proposal types.")}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {creators.map((creator) => (
            <button
              key={creator.userId}
              type="button"
              onClick={() => setSelectedCreatorId(creator.userId)}
              className={selectedCreatorId === creator.userId
                ? "rounded-2xl border border-accent bg-accent-soft p-4 text-left"
                : "rounded-2xl border border-line p-4 text-left hover:bg-raised"}
            >
              <span className="font-black">{creator.name}</span>
              <span className="mt-2 block text-xs leading-5 text-fg-3">{creator.note || bt("협업 제안을 받고 있습니다.", "Accepting collaboration proposals.")}</span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                {creator.acceptedTypes.slice(0, 4).map((type) => (
                  <span key={type} className="rounded-full bg-raised px-2 py-1 text-[11px]">
                    {typeLabel(type)}
                  </span>
                ))}
              </span>
              <span className="mt-3 block text-[11px] text-fg-3">
                {creator.acceptUnverified
                  ? bt("미인증 제안 허용", "Accepts unverified proposals")
                  : bt("인증 기업 제안만", "Verified businesses only")}
              </span>
            </button>
          ))}
        </div>
        {!creators.length ? (
          <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-canvas/60 px-6 py-12 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-lg">
              <Search size={28} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-black">{bt("아직 공개된 협업 가능 작가가 없어요", "No creators are listed yet")}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fg-2">
                {bt(
                  "작가님이 먼저 프로필을 공개하면 제안이 시작됩니다. 제안 수신 설정에서 협업 가능 목록에 올라가 보세요.",
                  "Proposals start when creators publish their profiles. List yourself from the proposal settings above.",
                )}
              </p>
            </div>
            {userId ? (
              <a href="#collab-preference" className={`${BUTTON} bg-accent text-on-accent`}>
                <Sparkles size={16} className="mr-1" aria-hidden="true" />
                {bt("프로필 공개 설정하기", "Publish my profile")}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {userId && selectedCreator ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-2">
            <Send size={20} className="text-accent" aria-hidden="true" />
            <h2 className="text-xl font-black">{bt(`${selectedCreator.name}에게 구조화된 제안 보내기`, `Send a structured proposal to ${selectedCreator.name}`)}</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <select
              className={INPUT}
              value={proposalType}
              aria-label={bt("제안 유형", "Proposal type")}
              onChange={(event) => setProposalType(event.target.value as CollaborationType)}
            >
              {selectedCreator.acceptedTypes.map((type) => (
                <option key={type} value={type}>{typeLabel(type)}</option>
              ))}
            </select>
            <input
              className={INPUT}
              value={proposalTitle}
              onChange={(event) => setProposalTitle(event.target.value)}
              placeholder={bt("제안 제목", "Proposal title")}
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              value={budgetMin}
              onChange={(event) => setBudgetMin(event.target.value)}
              placeholder={bt("최소 예산(원)", "Min budget (KRW)")}
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              value={budgetMax}
              onChange={(event) => setBudgetMax(event.target.value)}
              placeholder={bt("최대 예산(원)", "Max budget (KRW)")}
            />
            <input
              className={INPUT}
              value={territories}
              onChange={(event) => setTerritories(event.target.value)}
              placeholder={bt("사용 지역, 쉼표 구분", "Territories, comma-separated")}
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              max={120}
              value={durationMonths}
              onChange={(event) => setDurationMonths(event.target.value)}
              placeholder={bt("권리 기간(개월)", "Rights period (months)")}
            />
            <input
              className={INPUT}
              value={rightsRequested}
              onChange={(event) => setRightsRequested(event.target.value)}
              placeholder={bt("필요 권리: 상품화권, 영상화권 등", "Rights needed: merchandising, adaptation, …")}
            />
            <input
              className={INPUT}
              type="url"
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder={bt("https:// 프로젝트 자료 (선택)", "https:// project materials (optional)")}
            />
          </div>
          <textarea
            className={`${TEXTAREA} mt-3 min-h-36`}
            value={proposalSummary}
            onChange={(event) => setProposalSummary(event.target.value)}
            placeholder={bt("프로젝트 목적, 예상 제작물, 일정, 수익배분 또는 지급 방식 등 핵심 조건을 구체적으로 적어 주세요.", "Describe the goal, deliverables, schedule, and revenue/payment terms in detail.")}
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={exclusive} onChange={(event) => setExclusive(event.target.checked)} />
            {bt("독점 권리를 요청하는 제안", "This proposal requests exclusive rights")}
          </label>
          <button
            type="button"
            className={`${BUTTON} mt-4 bg-accent text-on-accent`}
            disabled={busy === "proposal"}
            onClick={() => void sendProposal()}
          >
            {bt("제안 보내기", "Send proposal")}
          </button>
        </section>
      ) : null}

      {userId ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <ProposalList
            title={bt("받은 제안", "Received proposals")}
            emptyArt="inbox"
            items={inbox}
            busy={busy}
            mode="inbox"
            onStatus={changeProposalStatus}
          />
          <ProposalList
            title={bt("보낸 제안", "Sent proposals")}
            emptyArt="sent"
            items={sent}
            busy={busy}
            mode="sent"
            onStatus={changeProposalStatus}
          />
        </section>
      ) : null}
    </CreatorEcosystemLayout>
  );
}

function ProposalList({
  title,
  emptyArt,
  items,
  busy,
  mode,
  onStatus,
}: {
  title: string;
  emptyArt: "inbox" | "sent";
  items: Proposal[];
  busy: string;
  mode: "inbox" | "sent";
  onStatus: (id: string, status: CollaborationProposalStatus) => Promise<void>;
}) {
  const bt = useBilingual(SCOPE);
  const typeLabel = (type: CollaborationType) => bt(COLLABORATION_TYPE_LABELS[type], COLLABORATION_TYPE_EN[type]);
  const statusLabel = (status: CollaborationProposalStatus) => bt(PROPOSAL_STATUS_KO[status], PROPOSAL_STATUS_EN[status]);
  const verificationLabel = (status: BusinessVerificationStatus) => bt(VERIFICATION_KO[status], VERIFICATION_EN[status]);
  return (
    <article className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-accent">{typeLabel(item.type)}</p>
                <h3 className="mt-1 font-black">{item.title}</h3>
              </div>
              <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold">
                {statusLabel(item.status)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-fg-2">{item.summary}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-3">
              <div><dt className="font-bold">{bt("조직", "Organization")}</dt><dd>{item.organization}</dd></div>
              <div><dt className="font-bold">{bt("인증", "Verification")}</dt><dd>{verificationLabel(item.senderVerificationStatus)}</dd></div>
              <div><dt className="font-bold">{bt("예산", "Budget")}</dt><dd>{money(item.budgetMinWon, bt("협의", "Negotiable"))} ~ {money(item.budgetMaxWon, bt("협의", "Negotiable"))}</dd></div>
              <div><dt className="font-bold">{bt("권리기간", "Rights period")}</dt><dd>{item.durationMonths ? bt(`${item.durationMonths}개월`, `${item.durationMonths} months`) : bt("협의", "Negotiable")}</dd></div>
            </dl>
            {mode === "inbox" && ["new", "reviewing"].includes(item.status) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === "new" ? (
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void onStatus(item.id, "reviewing")}>
                    {bt("검토 시작", "Start review")}
                  </button>
                ) : null}
                <button className={`${BUTTON} border-emerald-500/50`} disabled={busy === item.id} onClick={() => void onStatus(item.id, "accepted")}>
                  <CheckCircle2 size={15} className="mr-1" aria-hidden="true" />{bt("수락", "Accept")}
                </button>
                <button className={BUTTON} disabled={busy === item.id} onClick={() => void onStatus(item.id, "declined")}>
                  {bt("거절", "Decline")}
                </button>
              </div>
            ) : null}
            {mode === "sent" && ["new", "reviewing"].includes(item.status) ? (
              <button className={`${BUTTON} mt-4`} disabled={busy === item.id} onClick={() => void onStatus(item.id, "withdrawn")}>
                {bt("제안 철회", "Withdraw proposal")}
              </button>
            ) : null}
          </div>
        ))}
        {!items.length ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-canvas/60 px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-lg">
              {emptyArt === "inbox" ? <Inbox size={26} aria-hidden="true" /> : <Send size={26} aria-hidden="true" />}
            </span>
            <div>
              <h3 className="font-black">
                {emptyArt === "inbox"
                  ? bt("받은 제안이 아직 없어요", "No proposals received yet")
                  : bt("보낸 제안이 아직 없어요", "No proposals sent yet")}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-fg-2">
                {emptyArt === "inbox"
                  ? bt("제안 수신 설정을 저장하고 프로필을 공개하면 제안이 도착하기 시작합니다.", "Save your proposal settings and publish your profile to start receiving proposals.")
                  : bt("협업 가능한 작가 목록에서 마음에 드는 작가에게 첫 제안을 보내 보세요.", "Send your first proposal to a creator from the open directory.")}
              </p>
            </div>
            <a href="#collab-preference" className={BUTTON}>
              {emptyArt === "inbox" ? bt("수신 설정 열기", "Open receiving settings") : bt("작가 목록 보기", "Browse creators")}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}
