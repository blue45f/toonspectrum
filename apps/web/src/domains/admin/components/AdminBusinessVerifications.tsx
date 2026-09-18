import { BadgeCheck, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, getApiErrorMessage } from "@/infrastructure/api";

import type { BusinessVerificationStatus } from "@/shared/lib/types";

interface BusinessVerificationItem {
  profile: {
    userId: string;
    organization: string;
    website: string;
    contactEmail: string;
    evidenceNote: string;
    verificationStatus: BusinessVerificationStatus;
    reviewNote: string;
    updatedAt: string;
  };
  userName: string | null;
  userEmail: string | null;
}

const STATUS_LABEL: Record<BusinessVerificationStatus, string> = {
  draft: "작성 중",
  pending: "검토 대기",
  verified: "인증 완료",
  rejected: "보완 필요",
};

export function AdminBusinessVerifications() {
  const [status, setStatus] = useState<BusinessVerificationStatus | "all">("pending");
  const [items, setItems] = useState<BusinessVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<{ items: BusinessVerificationItem[] }>(
        "/admin/creator-ecosystem/business-verifications",
        { params: { status: status === "all" ? undefined : status } },
      );
      setItems(result.items);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "기업 인증 대기열을 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    userId: string,
    nextStatus: "verified" | "rejected",
  ) {
    const reviewNote = nextStatus === "rejected"
      ? window.prompt("보완이 필요한 이유를 입력해 주세요.", "") ?? ""
      : "";
    if (nextStatus === "rejected" && !reviewNote.trim()) return;
    setUpdating(userId);
    setError("");
    try {
      await api.patch(
        `/admin/creator-ecosystem/business-verifications/${encodeURIComponent(userId)}`,
        { status: nextStatus, reviewNote },
      );
      await load();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "기업 인증 상태를 변경하지 못했어요."));
    } finally {
      setUpdating("");
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="business-verification-title">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Creator IP business verification</p>
          <h2 id="business-verification-title" className="mt-1 text-xl font-bold text-fg">작가 협업 기업 인증</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            굿즈·영상·브랜드·판권 제안을 보내려는 기업·단체의 공개 정보와 담당 연락처를 확인합니다.
            인증은 신뢰 표시이며 개별 계약 조건이나 지급 능력을 보증하지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-fg-3">
            상태
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as BusinessVerificationStatus | "all")}
              className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg"
            >
              <option value="all">전체</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg-2 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4">
        {items.map(({ profile, userName, userEmail }) => (
          <article key={profile.userId} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
                    {STATUS_LABEL[profile.verificationStatus]}
                  </span>
                  <span className="text-xs text-fg-3">{userName || userEmail || profile.userId}</span>
                </div>
                <h3 className="mt-3 text-lg font-black text-fg">{profile.organization}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a className="font-semibold text-accent hover:underline" href={`mailto:${profile.contactEmail}`}>
                    {profile.contactEmail}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 text-fg-2 hover:text-accent"
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    공식 사이트 <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-panel p-4 text-sm leading-6 text-fg-2">
              {profile.evidenceNote}
            </p>
            {profile.reviewNote ? (
              <p className="mt-3 text-xs text-fg-3">최근 검토 메모: {profile.reviewNote}</p>
            ) : null}
            {profile.verificationStatus === "pending" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={updating === profile.userId}
                  onClick={() => void review(profile.userId, "verified")}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-bold disabled:opacity-60"
                >
                  <BadgeCheck size={15} aria-hidden="true" /> 인증
                </button>
                <button
                  type="button"
                  disabled={updating === profile.userId}
                  onClick={() => void review(profile.userId, "rejected")}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold disabled:opacity-60"
                >
                  <ShieldAlert size={15} aria-hidden="true" /> 보완 요청
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {!loading && items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-6 text-sm text-fg-3">
            해당 상태의 기업 인증 요청이 없습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
