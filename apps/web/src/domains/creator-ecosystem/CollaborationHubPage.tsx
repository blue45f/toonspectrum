import { Building2, CheckCircle2, Inbox, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

import {
  COLLABORATION_TYPES,
  COLLABORATION_TYPE_LABELS,
} from "@/shared/lib/types";
import { api, getApiErrorMessage } from "@/platform/api";
import { useApp } from "@/shared/lib/store";

import type {
  BusinessVerificationStatus,
  CollaborationProposalStatus,
  CollaborationType,
} from "@/shared/lib/types";

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

const PROPOSAL_STATUS_LABEL: Record<CollaborationProposalStatus, string> = {
  new: "신규",
  reviewing: "검토 중",
  accepted: "수락",
  declined: "거절",
  withdrawn: "철회",
};

const VERIFICATION_LABEL: Record<BusinessVerificationStatus, string> = {
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

function money(value: number): string {
  if (!value) return "협의";
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

export function CollaborationHubPage() {
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
  const [territories, setTerritories] = useState("대한민국");
  const [rightsRequested, setRightsRequested] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [exclusive, setExclusive] = useState(false);
  const [projectUrl, setProjectUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
      setNotice("제안 수신 설정을 저장했습니다.");
      await refreshPublicCreators();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "제안 수신 설정을 저장하지 못했어요."));
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
      setNotice("기업·단체 정보를 저장했습니다. 변경된 정보는 다시 인증이 필요합니다.");
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "기업·단체 정보를 저장하지 못했어요."));
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
      setNotice("기업 인증 검토를 요청했습니다.");
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "기업 인증 요청을 처리하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  async function sendProposal() {
    if (!selectedCreator) {
      setError("제안을 받을 작가를 선택해 주세요.");
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
      setNotice("협업 제안을 전송했습니다.");
      await refreshPrivate();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "협업 제안을 보내지 못했어요."));
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
      setError(await getApiErrorMessage(cause, "제안 상태를 변경하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  return (
    <CreatorEcosystemLayout
      title="작가 IP 협업 · 협찬"
      intro="굿즈·영상·브랜드·출판·애니메이션·게임·판권 제안을 구조화합니다. 작가는 받을 제안 범위와 미인증 제안 허용 여부를 직접 정하고, 기업은 인증 상태와 예산·권리 범위를 명시해 제안합니다."
    >
      {!userId ? (
        <div className="rounded-2xl border border-line bg-panel p-5 text-sm leading-6 text-fg-2">
          작가 제안 설정, 기업 인증, 제안 송수신은 로그인 후 사용할 수 있습니다. 공개된 협업 가능 작가 목록은 아래에서 확인할 수 있습니다.
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

      {userId ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <article className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2">
              <Inbox size={20} className="text-accent" aria-hidden="true" />
              <h2 className="text-xl font-black">작가 제안 수신 설정</h2>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={preference.discoverable}
                onChange={(event) => setPreference((value) => ({ ...value, discoverable: event.target.checked }))}
              />
              협업 가능 작가 목록에 내 프로필 공개
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {COLLABORATION_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={preference.acceptedTypes.includes(type)}
                    onChange={() => toggleAcceptedType(type)}
                  />
                  {COLLABORATION_TYPE_LABELS[type]}
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
                미인증 기업·단체의 제안도 허용
                <span className="mt-1 block text-xs text-fg-3">기본값은 인증된 제안만 허용하는 것이 안전합니다.</span>
              </span>
            </label>
            <textarea
              className={`${TEXTAREA} mt-4 min-h-24`}
              value={preference.note}
              maxLength={500}
              onChange={(event) => setPreference((value) => ({ ...value, note: event.target.value }))}
              placeholder="예: 국내 굿즈, 비독점 콜라보 우선 검토"
            />
            <button
              type="button"
              className={`${BUTTON} mt-4 bg-accent text-on-accent`}
              disabled={busy === "preference"}
              onClick={() => void savePreference()}
            >
              수신 설정 저장
            </button>
          </article>

          <article className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 size={20} className="text-accent" aria-hidden="true" />
                <h2 className="text-xl font-black">기업 · 단체 인증</h2>
              </div>
              <span className="rounded-full bg-raised px-3 py-1 text-xs font-bold">
                {VERIFICATION_LABEL[business.verificationStatus]}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              <input
                className={INPUT}
                value={business.organization}
                onChange={(event) => setBusiness((value) => ({ ...value, organization: event.target.value }))}
                placeholder="기업·단체명"
              />
              <input
                className={INPUT}
                type="url"
                value={business.website}
                onChange={(event) => setBusiness((value) => ({ ...value, website: event.target.value }))}
                placeholder="https:// 공식 웹사이트"
              />
              <input
                className={INPUT}
                type="email"
                value={business.contactEmail}
                onChange={(event) => setBusiness((value) => ({ ...value, contactEmail: event.target.value }))}
                placeholder="업무용 이메일"
              />
              <textarea
                className={`${TEXTAREA} min-h-28`}
                value={business.evidenceNote}
                onChange={(event) => setBusiness((value) => ({ ...value, evidenceNote: event.target.value }))}
                placeholder="사업 분야, 담당 조직, 확인 가능한 공개 정보 등을 적어 주세요."
              />
            </div>
            {business.reviewNote ? (
              <p className="mt-3 rounded-xl bg-raised p-3 text-xs text-fg-2">검토 메모: {business.reviewNote}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={busy === "business"}
                onClick={() => void saveBusiness()}
              >
                정보 저장
              </button>
              <button
                type="button"
                className={`${BUTTON} border-accent text-accent`}
                disabled={busy === "verify" || business.verificationStatus === "pending" || business.verificationStatus === "verified"}
                onClick={() => void submitVerification()}
              >
                <ShieldCheck size={16} className="mr-1" aria-hidden="true" />
                인증 요청
              </button>
            </div>
          </article>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="text-xl font-black">협업 가능한 작가</h2>
        <p className="mt-2 text-sm text-fg-2">작가가 직접 공개하고 제안 유형을 선택한 프로필만 표시합니다.</p>
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
              <span className="mt-2 block text-xs leading-5 text-fg-3">{creator.note || "협업 제안을 받고 있습니다."}</span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                {creator.acceptedTypes.slice(0, 4).map((type) => (
                  <span key={type} className="rounded-full bg-raised px-2 py-1 text-[11px]">
                    {COLLABORATION_TYPE_LABELS[type]}
                  </span>
                ))}
              </span>
              <span className="mt-3 block text-[11px] text-fg-3">
                {creator.acceptUnverified ? "미인증 제안 허용" : "인증 기업 제안만"}
              </span>
            </button>
          ))}
        </div>
        {!creators.length ? (
          <p className="mt-5 text-sm text-fg-3">아직 공개된 협업 가능 작가가 없습니다.</p>
        ) : null}
      </section>

      {userId && selectedCreator ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-2">
            <Send size={20} className="text-accent" aria-hidden="true" />
            <h2 className="text-xl font-black">{selectedCreator.name}에게 구조화된 제안 보내기</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <select
              className={INPUT}
              value={proposalType}
              onChange={(event) => setProposalType(event.target.value as CollaborationType)}
            >
              {selectedCreator.acceptedTypes.map((type) => (
                <option key={type} value={type}>{COLLABORATION_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <input
              className={INPUT}
              value={proposalTitle}
              onChange={(event) => setProposalTitle(event.target.value)}
              placeholder="제안 제목"
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              value={budgetMin}
              onChange={(event) => setBudgetMin(event.target.value)}
              placeholder="최소 예산(원)"
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              value={budgetMax}
              onChange={(event) => setBudgetMax(event.target.value)}
              placeholder="최대 예산(원)"
            />
            <input
              className={INPUT}
              value={territories}
              onChange={(event) => setTerritories(event.target.value)}
              placeholder="사용 지역, 쉼표 구분"
            />
            <input
              className={INPUT}
              type="number"
              min={0}
              max={120}
              value={durationMonths}
              onChange={(event) => setDurationMonths(event.target.value)}
              placeholder="권리 기간(개월)"
            />
            <input
              className={INPUT}
              value={rightsRequested}
              onChange={(event) => setRightsRequested(event.target.value)}
              placeholder="필요 권리: 상품화권, 영상화권 등"
            />
            <input
              className={INPUT}
              type="url"
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder="https:// 프로젝트 자료 (선택)"
            />
          </div>
          <textarea
            className={`${TEXTAREA} mt-3 min-h-36`}
            value={proposalSummary}
            onChange={(event) => setProposalSummary(event.target.value)}
            placeholder="프로젝트 목적, 예상 제작물, 일정, 수익배분 또는 지급 방식 등 핵심 조건을 구체적으로 적어 주세요."
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={exclusive} onChange={(event) => setExclusive(event.target.checked)} />
            독점 권리를 요청하는 제안
          </label>
          <button
            type="button"
            className={`${BUTTON} mt-4 bg-accent text-on-accent`}
            disabled={busy === "proposal"}
            onClick={() => void sendProposal()}
          >
            제안 보내기
          </button>
        </section>
      ) : null}

      {userId ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <ProposalList
            title="받은 제안"
            items={inbox}
            busy={busy}
            mode="inbox"
            onStatus={changeProposalStatus}
          />
          <ProposalList
            title="보낸 제안"
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
  items,
  busy,
  mode,
  onStatus,
}: {
  title: string;
  items: Proposal[];
  busy: string;
  mode: "inbox" | "sent";
  onStatus: (id: string, status: CollaborationProposalStatus) => Promise<void>;
}) {
  return (
    <article className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-accent">{COLLABORATION_TYPE_LABELS[item.type]}</p>
                <h3 className="mt-1 font-black">{item.title}</h3>
              </div>
              <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold">
                {PROPOSAL_STATUS_LABEL[item.status]}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-fg-2">{item.summary}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-3">
              <div><dt className="font-bold">조직</dt><dd>{item.organization}</dd></div>
              <div><dt className="font-bold">인증</dt><dd>{VERIFICATION_LABEL[item.senderVerificationStatus]}</dd></div>
              <div><dt className="font-bold">예산</dt><dd>{money(item.budgetMinWon)} ~ {money(item.budgetMaxWon)}</dd></div>
              <div><dt className="font-bold">권리기간</dt><dd>{item.durationMonths ? `${item.durationMonths}개월` : "협의"}</dd></div>
            </dl>
            {mode === "inbox" && ["new", "reviewing"].includes(item.status) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === "new" ? (
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void onStatus(item.id, "reviewing")}>
                    검토 시작
                  </button>
                ) : null}
                <button className={`${BUTTON} border-emerald-500/50`} disabled={busy === item.id} onClick={() => void onStatus(item.id, "accepted")}>
                  <CheckCircle2 size={15} className="mr-1" aria-hidden="true" />수락
                </button>
                <button className={BUTTON} disabled={busy === item.id} onClick={() => void onStatus(item.id, "declined")}>
                  거절
                </button>
              </div>
            ) : null}
            {mode === "sent" && ["new", "reviewing"].includes(item.status) ? (
              <button className={`${BUTTON} mt-4`} disabled={busy === item.id} onClick={() => void onStatus(item.id, "withdrawn")}>
                제안 철회
              </button>
            ) : null}
          </div>
        ))}
        {!items.length ? <p className="text-sm text-fg-3">아직 표시할 제안이 없습니다.</p> : null}
      </div>
    </article>
  );
}
