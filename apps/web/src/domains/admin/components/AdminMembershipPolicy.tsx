import { RefreshCw, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner, adminInputClass } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

type PolicyState = {
  economy: {
    mode: string;
    paymentsEnabled: boolean;
    studioCreditsEnabled: boolean;
    membershipCreditsEnabled: boolean;
    creditPurchasesEnabled: boolean;
  };
  plans: Array<{
    id: string;
    label: string;
    description: string;
    entitlements: Record<string, number | boolean>;
  }>;
  activityRewards: Array<{
    key: string;
    label: string;
    points: number;
    dailyGrantLimit: number;
    cooldownSeconds: number;
  }>;
  overrides: Array<{
    key: string;
    value: unknown;
    active: boolean;
  }>;
};
type UserOverview = {
  membership: {
    planId: string;
    grants: Array<{
      id: string;
      planId: string;
      source: string;
      endsAt?: string | null;
    }>;
  };
  wallet: {
    points: {
      available: number;
      lifetimeGranted: number;
      lifetimeSpent: number;
    };
    studioCredits: {
      available: number;
      lifetimeGranted: number;
      lifetimeSpent: number;
    };
  };
  levels: {
    creatorLevel: string;
    trustLevel: string;
    sellerLevel: string;
    trustScore: number;
  };
};

const creatorLevels = [
  "new", "verified", "active", "trusted", "professional", "partner",
];
const trustLevels = ["new", "verified", "trusted", "restricted"];
const sellerLevels = ["none", "starter", "verified", "professional"];
export function AdminMembershipPolicy({ uid }: { uid: string }) {
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [user, setUser] = useState<UserOverview | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("100");
  const [reason, setReason] = useState("운영 보정");
  const [planId, setPlanId] = useState("creator");
  const [durationDays, setDurationDays] = useState("30");
  const [creatorLevel, setCreatorLevel] = useState("new");
  const [trustLevel, setTrustLevel] = useState("new");
  const [sellerLevel, setSellerLevel] = useState("none");
  const [trustScore, setTrustScore] = useState("0");
  const [overrideKey, setOverrideKey] = useState("activity:community.comment.created");
  const [overrideJson, setOverrideJson] = useState('{"points":3,"dailyGrantLimit":10,"cooldownSeconds":20}');
  const [message, setMessage] = useState("");

  const loadPolicy = useCallback(async () => {
    setPolicyError(null);
    try {
      setPolicy(await adminFetch<PolicyState>("/membership/policy", uid));
    } catch (error) {
      setPolicyError((error as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);
  const loadUser = useCallback(async () => {
    const id = targetUserId.trim();
    if (!id) return;
    setUserError(null);
    setMessage("");
    try {
      const next = await adminFetch<UserOverview>(
        "/membership/users/" + encodeURIComponent(id),
        uid,
      );
      setUser(next);
      setCreatorLevel(next.levels.creatorLevel);
      setTrustLevel(next.levels.trustLevel);
      setSellerLevel(next.levels.sellerLevel);
      setTrustScore(String(next.levels.trustScore ?? 0));
    } catch (error) {
      setUser(null);
      setUserError((error as AdminApiError).message);
    }
  }, [targetUserId, uid]);

  const mutate = async (
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    setUserError(null);
    try {
      await adminFetch(path, uid, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(success);
      if (targetUserId.trim()) await loadUser();
      await loadPolicy();
    } catch (error) {
      setUserError((error as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const applyPointAdjustment = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/wallet-adjustments",
      {
        asset: "reward_point",
        delta: Number(delta),
        requestKey: crypto.randomUUID(),
        reason: reason.trim(),
      },
      "포인트 조정을 반영했습니다.",
    );
  };
  const applyMembership = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/memberships",
      {
        planId,
        durationDays: Number(durationDays),
        requestKey: crypto.randomUUID(),
        reason: "관리자 멤버십 부여",
      },
      "멤버십을 부여했습니다.",
    );
  };

  const applyLevels = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/levels",
      {
        creatorLevel,
        trustLevel,
        sellerLevel,
        trustScore: Number(trustScore),
      },
      "회원 등급을 갱신했습니다.",
    );
  };
  const applyOverride = async () => {
    let value: unknown;
    try {
      value = JSON.parse(overrideJson);
    } catch {
      setPolicyError("정책 JSON 형식을 확인해 주세요.");
      return;
    }
    setBusy(true);
    setPolicyError(null);
    setMessage("");
    try {
      await adminFetch(
        "/membership/policy/" + encodeURIComponent(overrideKey.trim()),
        uid,
        {
          method: "POST",
          body: JSON.stringify({ value, active: true }),
        },
      );
      setMessage("정책 오버라이드를 저장했습니다.");
      await loadPolicy();
    } catch (error) {
      setPolicyError((error as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!policy && !policyError) return <AdminSpinner />;
  return (
    <section className="mt-8 border-t border-line pt-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.13em] text-accent">
            MEMBERSHIP POLICY ENGINE
          </p>
          <h2 className="mt-1 text-xl font-bold text-fg">
            멤버십 · 포인트 · 회원등급 운영
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-3">
            베타 권한, 활동 포인트 원장, 신뢰·판매자 등급을 중앙 정책에서 관리합니다.
          </p>
        </div>
        <button
          type="button"
          className={adminButtonClass("ghost")}
          onClick={() => void loadPolicy()}
        >
          <RefreshCw size={14} /> 정책 새로고침
        </button>
      </div>

      {policyError ? (
        <div className="mt-4">
          <AdminNotice title="멤버십 정책 오류" body={policyError} />
        </div>
      ) : null}
      {policy ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-line bg-panel/55 p-4">
            <ShieldCheck size={18} className="text-accent" />
            <h3 className="mt-3 font-semibold text-fg">경제 정책</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">운영 모드</dt>
                <dd className="font-semibold text-fg">{policy.economy.mode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">실결제</dt>
                <dd className="font-semibold text-fg">
                  {policy.economy.paymentsEnabled ? "활성" : "비활성"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">크레딧 구매</dt>
                <dd className="font-semibold text-fg">
                  {policy.economy.creditPurchasesEnabled ? "활성" : "비활성"}
                </dd>
              </div>
            </dl>
          </article>
          <article className="rounded-2xl border border-line bg-panel/55 p-4 lg:col-span-2">
            <h3 className="font-semibold text-fg">활동 포인트 정책</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {policy.activityRewards.map((reward) => (
                <div
                  key={reward.key}
                  className="rounded-xl border border-line bg-card/45 px-3 py-2.5 text-xs"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-fg">{reward.label}</span>
                    <span className="font-bold text-accent">+{reward.points} P</span>
                  </div>
                  <p className="mt-1 text-fg-3">
                    {reward.dailyGrantLimit}회/일 · {reward.cooldownSeconds}초
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <Search size={16} /> 사용자 운영
          </h3>
          <div className="mt-3 flex gap-2">
            <input
              className={adminInputClass}
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              placeholder="사용자 ID"
            />
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={() => void loadUser()}
            >
              조회
            </button>
          </div>

          {userError ? <p className="mt-3 text-xs text-bad">{userError}</p> : null}
          {message ? <p className="mt-3 text-xs text-good">{message}</p> : null}

          {user ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[
                  ["멤버십", user.membership.planId],
                  ["포인트", user.wallet.points.available.toLocaleString() + " P"],
                  ["Credit", user.wallet.studioCredits.available.toLocaleString() + " C"],
                  ["Trust", user.levels.trustLevel],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-card/45 p-3">
                    <p className="text-[0.68rem] text-fg-3">{label}</p>
                    <p className="mt-1 font-bold text-fg">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">포인트 지급/회수</p>
                <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]">
                  <input type="number" className={adminInputClass} value={delta}
                    onChange={(event) => setDelta(event.target.value)}
                    aria-label="포인트 조정량" />
                  <input className={adminInputClass} value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="조정 사유" />
                  <button type="button" className={adminButtonClass("accent")}
                    disabled={busy || Number(delta) === 0}
                    onClick={applyPointAdjustment}>반영</button>
                </div>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  음수 회수도 기존 거래를 수정하지 않고 adjustment 원장을 추가합니다.
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">멤버십 부여</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                  <select className={adminInputClass} value={planId}
                    onChange={(event) => setPlanId(event.target.value)}>
                    {["free", "creator", "pro", "team"].map((plan) => (
                      <option key={plan} value={plan}>{plan}</option>
                    ))}
                  </select>
                  <input type="number" min={1} className={adminInputClass}
                    value={durationDays}
                    onChange={(event) => setDurationDays(event.target.value)}
                    aria-label="멤버십 일수" />
                  <button type="button" className={adminButtonClass("accent")}
                    disabled={busy} onClick={applyMembership}>부여</button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">회원 등급</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={adminInputClass} value={creatorLevel}
                    onChange={(event) => setCreatorLevel(event.target.value)}>
                    {creatorLevels.map((level) => (
                      <option key={level} value={level}>Creator · {level}</option>
                    ))}
                  </select>
                  <select className={adminInputClass} value={trustLevel}
                    onChange={(event) => setTrustLevel(event.target.value)}>
                    {trustLevels.map((level) => (
                      <option key={level} value={level}>Trust · {level}</option>
                    ))}
                  </select>
                  <select className={adminInputClass} value={sellerLevel}
                    onChange={(event) => setSellerLevel(event.target.value)}>
                    {sellerLevels.map((level) => (
                      <option key={level} value={level}>Seller · {level}</option>
                    ))}
                  </select>
                  <input type="number" min={0} max={1000}
                    className={adminInputClass} value={trustScore}
                    onChange={(event) => setTrustScore(event.target.value)}
                    aria-label="신뢰 점수" />
                </div>
                <button type="button"
                  className={adminButtonClass("ghost") + " mt-2"}
                  disabled={busy} onClick={applyLevels}>등급 저장</button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <SlidersHorizontal size={16} /> 정책 오버라이드
          </h3>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            코드 배포 없이 plan:, activity:, credit: 정책 값을 조정합니다.
            변경 내역은 관리자 감사 로그에 남습니다.
          </p>
          <label className="mt-4 block text-xs font-semibold text-fg-2">
            정책 키
            <input className={adminInputClass + " mt-1"} value={overrideKey}
              onChange={(event) => setOverrideKey(event.target.value)} />
          </label>
          <label className="mt-3 block text-xs font-semibold text-fg-2">
            JSON 값
            <textarea className={adminInputClass + " mt-1 min-h-36 font-mono text-xs"}
              value={overrideJson}
              onChange={(event) => setOverrideJson(event.target.value)} />
          </label>
          <button type="button"
            className={adminButtonClass("accent") + " mt-3"}
            disabled={busy || !overrideKey.trim()}
            onClick={() => void applyOverride()}>정책 저장</button>

          {policy?.overrides.length ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-fg-2">활성 오버라이드</p>
              {policy.overrides.map((override) => (
                <div key={override.key}
                  className="rounded-xl border border-line bg-card/45 px-3 py-2 text-xs">
                  <p className="font-mono font-semibold text-fg">{override.key}</p>
                  <p className="mt-1 truncate font-mono text-fg-3">
                    {JSON.stringify(override.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
