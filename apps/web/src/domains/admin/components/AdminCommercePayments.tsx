import {
  CreditCard,
  ExternalLink,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  CommerceOrderPublicEntry,
  CommercePaymentMethod,
} from "@toonspectrum/core/commerce";

import {
  adminFetch,
  type AdminApiError,
} from "./admin-client";
import { adminButtonClass } from "./admin-ui-utils";

interface CommerceAdminSettings {
  operationMode: "free" | "paid";
  provider: "toss" | "mock";
  defaultMarketPriceKrw: number;
  paymentMethods: CommercePaymentMethod[];
  freePolicyNotice: string;
  paidPolicyNotice: string;
  termsVersion: string;
  providerMode: "test" | "live" | "mock" | null;
  checkoutEnabled: boolean;
  disabledReason: string | null;
}

const METHODS: readonly [CommercePaymentMethod, string][] = [
  ["card", "신용·체크카드"],
  ["apple_pay", "Apple Pay"],
  ["samsung_pay", "Samsung Pay"],
  ["naver_pay", "네이버페이"],
  ["kakao_pay", "카카오페이"],
  ["toss_pay", "토스페이"],
  ["bank_transfer", "계좌이체"],
  ["virtual_account", "가상계좌"],
  ["mobile", "휴대폰 결제"],
];

const won = (value: number) => "₩" + value.toLocaleString("ko-KR");

export function AdminCommercePayments({ uid }: { uid: string }) {
  const [settings, setSettings] = useState<CommerceAdminSettings | null>(null);
  const [draft, setDraft] = useState<CommerceAdminSettings | null>(null);
  const [orders, setOrders] = useState<CommerceOrderPublicEntry[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [resourcePrice, setResourcePrice] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextSettings, nextOrders] = await Promise.all([
        adminFetch<CommerceAdminSettings>("/commerce/settings", uid),
        adminFetch<{ items: CommerceOrderPublicEntry[] }>("/commerce/orders", uid),
      ]);
      setSettings(nextSettings);
      setDraft(nextSettings);
      setOrders(nextOrders.items);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy("settings");
    setError("");
    try {
      const next = await adminFetch<CommerceAdminSettings>(
        "/commerce/settings",
        uid,
        {
          method: "POST",
          body: JSON.stringify({
            operationMode: draft.operationMode,
            provider: draft.provider,
            defaultMarketPriceKrw: draft.defaultMarketPriceKrw,
            paymentMethods: draft.paymentMethods,
            freePolicyNotice: draft.freePolicyNotice,
            paidPolicyNotice: draft.paidPolicyNotice,
            termsVersion: draft.termsVersion,
          }),
        },
      );
      setSettings(next);
      setDraft(next);
      window.dispatchEvent(new Event("toonspectrum:commerce-config-changed"));
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  const toggleMethod = (method: CommercePaymentMethod) => {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.paymentMethods.includes(method);
      return {
        ...current,
        paymentMethods: selected
          ? current.paymentMethods.filter((entry) => entry !== method)
          : [...current.paymentMethods, method],
      };
    });
  };

  const saveResourcePrice = async () => {
    const normalizedId = resourceId.trim();
    if (!normalizedId) return;
    setBusy("price");
    setError("");
    try {
      await adminFetch(
        "/commerce/market/" + encodeURIComponent(normalizedId) + "/price",
        uid,
        {
          method: "POST",
          body: JSON.stringify({ amount: resourcePrice }),
        },
      );
      setResourceId("");
      setResourcePrice(0);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  const cancelOrder = async (order: CommerceOrderPublicEntry) => {
    const reason = window.prompt(
      "전액 환불 사유를 입력하세요.",
      "관리자 요청 전액 환불",
    )?.trim();
    if (!reason) return;
    setBusy(order.orderId);
    setError("");
    try {
      await adminFetch(
        "/commerce/orders/" + encodeURIComponent(order.orderId) + "/cancel",
        uid,
        { method: "POST", body: JSON.stringify({ reason }) },
      );
      await load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-accent/30 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              SITE COMMERCE POLICY
            </p>
            <h1 className="mt-1 text-xl font-bold text-fg">사이트 무료/유료 운영</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-3">
              무료 모드에서는 마켓 획득에 결제를 요구하지 않습니다. 유료 모드에서는 서버 결제 권한이 없는 리소스 획득을 차단하며,
              리소스 자체의 GPL·CC·ToonSpectrum 라이선스 조건은 가격 정책과 별도로 유지됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={
              "rounded-full border px-3 py-1 text-xs font-bold "
              + (draft?.operationMode === "paid"
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-good/40 bg-good/10 text-good")
            }>
              {draft?.operationMode === "paid" ? "PAID" : "FREE"}
            </span>
            <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-3">
              PG {settings?.providerMode ?? "not-ready"}
            </span>
          </div>
        </div>

        {!draft ? (
          <p className="mt-5 text-sm text-fg-3">결제 운영 설정을 불러오는 중…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-line bg-panel/60 p-4">
                <p className="text-xs font-semibold text-fg">운영 모드</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["free", "paid"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft((current) => current ? { ...current, operationMode: mode } : current)}
                      className={
                        "min-h-10 rounded-xl border text-sm font-bold "
                        + (draft.operationMode === mode
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2")
                      }
                    >
                      {mode === "free" ? "무료 운영" : "유료 운영"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="rounded-xl border border-line bg-panel/60 p-4 text-xs font-semibold text-fg">
                결제 Provider
                <select
                  value={draft.provider}
                  onChange={(event) => setDraft({
                    ...draft,
                    provider: event.target.value as "toss" | "mock",
                  })}
                  className="mt-2 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm"
                >
                  <option value="toss">Toss Payments</option>
                  <option value="mock">Mock (개발환경 전용)</option>
                </select>
              </label>

              <label className="rounded-xl border border-line bg-panel/60 p-4 text-xs font-semibold text-fg">
                마켓 기본 가격 (KRW)
                <input
                  type="number"
                  min={0}
                  max={10_000_000}
                  step={100}
                  value={draft.defaultMarketPriceKrw}
                  onChange={(event) => setDraft({
                    ...draft,
                    defaultMarketPriceKrw: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                  })}
                  className="mt-2 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-sm"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-fg">사이트에서 허용할 결제수단</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {METHODS.map(([method, label]) => (
                  <label
                    key={method}
                    className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2"
                  >
                    <input
                      type="checkbox"
                      checked={draft.paymentMethods.includes(method)}
                      onChange={() => toggleMethod(method)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-fg-3">
                실제 PG 위젯 노출은 Toss 계약 및 심사, 브라우저·기기 지원 조건을 추가로 따릅니다.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-xs font-semibold text-fg">
                무료 운영 정책 문구
                <textarea
                  rows={4}
                  value={draft.freePolicyNotice}
                  onChange={(event) => setDraft({ ...draft, freePolicyNotice: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-line bg-panel p-3 text-xs leading-5"
                />
              </label>
              <label className="text-xs font-semibold text-fg">
                유료 운영 정책 문구
                <textarea
                  rows={4}
                  value={draft.paidPolicyNotice}
                  onChange={(event) => setDraft({ ...draft, paidPolicyNotice: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-line bg-panel p-3 text-xs leading-5"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <label className="text-xs font-semibold text-fg">
                정책 버전
                <input
                  value={draft.termsVersion}
                  onChange={(event) => setDraft({ ...draft, termsVersion: event.target.value })}
                  className="mt-2 block min-h-10 w-56 rounded-xl border border-line bg-panel px-3 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy === "settings"}
                onClick={() => void save()}
                className={adminButtonClass("accent")}
              >
                <Save size={14} aria-hidden="true" />
                운영 설정 저장
              </button>
              <span className="text-xs text-fg-3">
                체크아웃 {settings?.checkoutEnabled ? "준비됨" : "비활성"}
                {settings?.disabledReason ? " · " + settings.disabledReason : ""}
              </span>
            </div>
          </div>
        )}
        {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">MARKET PRICE OVERRIDE</p>
            <h2 className="mt-1 text-lg font-bold text-fg">개별 마켓 가격</h2>
            <p className="mt-1 text-xs text-fg-3">0원은 유료 운영 중에도 해당 패키지를 무료로 유지합니다. 가격은 패키지 업데이트에도 유지됩니다.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-fg">
              리소스 릴리스 ID
              <input
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
                className="mt-1 block min-h-10 w-72 rounded-xl border border-line bg-panel px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-fg">
              가격
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={resourcePrice}
                onChange={(event) => setResourcePrice(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="mt-1 block min-h-10 w-32 rounded-xl border border-line bg-panel px-3 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy === "price" || !resourceId.trim()}
              onClick={() => void saveResourcePrice()}
              className={adminButtonClass("ghost")}
            >
              가격 저장
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">MARKET PAYMENT LEDGER</p>
            <h2 className="mt-1 text-lg font-bold text-fg">마켓 결제·환불</h2>
          </div>
          <button type="button" onClick={() => void load()} className={adminButtonClass("ghost")}>
            <RefreshCw size={14} aria-hidden="true" />
            새로고침
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-raised/50 text-left text-xs text-fg-3">
              <tr>
                <th className="px-3 py-2 font-medium">상품</th>
                <th className="px-3 py-2 font-medium">금액</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">결제</th>
                <th className="px-3 py-2 font-medium">주문</th>
                <th className="px-3 py-2 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-fg-3">
                    마켓 결제 내역이 없습니다.
                  </td>
                </tr>
              ) : null}
              {orders.map((order) => (
                <tr key={order.orderId} className="border-t border-line">
                  <td className="px-3 py-3">
                    <div className="font-medium text-fg">{order.productName}</div>
                    <code className="text-[10px] text-fg-3">{order.productId}</code>
                  </td>
                  <td className="px-3 py-3 font-semibold text-fg">
                    {won(order.balanceAmount)}
                    {order.balanceAmount !== order.amount ? (
                      <div className="text-[10px] font-normal text-fg-3">원결제 {won(order.amount)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-2">
                    {order.provider} · {order.providerMode}
                    <div>{order.method || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <code className="text-[10px] text-fg-3">{order.orderId}</code>
                    {order.receiptUrl ? (
                      <a
                        href={order.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent"
                      >
                        영수증 <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {(order.status === "DONE" || order.status === "PARTIAL_CANCELED") ? (
                      <button
                        type="button"
                        disabled={busy === order.orderId}
                        onClick={() => void cancelOrder(order)}
                        className={adminButtonClass("danger")}
                      >
                        전액 환불
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">
                        <ShieldCheck size={12} aria-hidden="true" /> 처리 없음
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-fg-3">
          <CreditCard size={12} aria-hidden="true" />
          카드번호·간편결제 인증정보는 저장하지 않고 PG 결제키와 주문 상태만 보관합니다.
        </p>
      </section>
    </>
  );
}
