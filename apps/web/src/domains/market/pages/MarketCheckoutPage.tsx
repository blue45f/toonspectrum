import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type {
  CommercePaymentMethod,
  MarketplaceCommerceQuote,
} from "@toonspectrum/core/commerce";
import type { TossWidgets } from "@/infrastructure/toss-payments-sdk";

import {
  confirmMarketplaceCommercePayment,
  createMarketplaceCommerceOrder,
  getMarketplaceCommerceQuote,
  type MarketCommerceOrder,
} from "../commerce-api";
import { MarketNavHeader } from "../components/MarketNavHeader";
import { useMarketLibrary } from "../hooks/use-market-library";
import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";
import { marketLicenseMeta } from "../models/market-kind";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import {
  getCreatorMarketplaceResource,
  resolveCreatorMarketplaceCloudLibraryAcquisitionTarget,
} from "@/infrastructure/creator-marketplace-client";
import { getApiErrorMessage } from "@/infrastructure/api";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { loadTossPaymentsSdk } from "@/infrastructure/toss-payments-sdk";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/hooks/use-document-title";

const PAYMENT_METHOD_LABELS: Record<CommercePaymentMethod, string> = {
  card: "신용·체크카드",
  apple_pay: "Apple Pay",
  samsung_pay: "Samsung Pay",
  naver_pay: "네이버페이",
  kakao_pay: "카카오페이",
  toss_pay: "토스페이",
  bank_transfer: "계좌이체",
  virtual_account: "가상계좌",
  mobile: "휴대폰 결제",
};

function formatKrw(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

function checkoutHref(resourceId: string): string {
  return "/market/checkout/" + encodeURIComponent(resourceId);
}

export function MarketCheckoutPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, ready, status } = useSession();
  const { record, loading: resourceLoading, notFound } = useMarketResourceDetail(id);
  const { acquireResource } = useMarketLibrary();

  const [quote, setQuote] = useState<MarketplaceCommerceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [order, setOrder] = useState<MarketCommerceOrder | null>(null);
  const [widgets, setWidgets] = useState<TossWidgets | null>(null);
  const [working, setWorking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef<string | null>(null);

  useDocumentTitle("마켓 결제 · ToonSpectrum");
  useMetaDescription("마켓 리소스의 가격과 라이선스를 확인하고 안전하게 결제합니다.");

  const authenticated = ready && status === "authenticated" && Boolean(session.user.id);

  useEffect(() => {
    if (!id) {
      setQuoteLoading(false);
      return;
    }
    const controller = new AbortController();
    setQuoteLoading(true);
    setError(null);
    void getMarketplaceCommerceQuote(id, controller.signal)
      .then(setQuote)
      .catch(async (caught) => {
        if (controller.signal.aborted) return;
        setError(await getApiErrorMessage(caught, "가격과 결제 정책을 불러오지 못했습니다."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [id, authenticated]);

  const completeAcquisition = useCallback(async () => {
    if (!id) throw new Error("리소스 식별자가 없습니다.");
    const target = await resolveCreatorMarketplaceCloudLibraryAcquisitionTarget(id);
    if (target.state !== "available") {
      throw new Error("결제는 확인됐지만 현재 공개된 설치 대상을 찾을 수 없습니다.");
    }
    const currentId = target.currentHead.id;
    const targetRecord = record?.id === currentId
      ? record
      : await getCreatorMarketplaceResource(currentId);
    const acquired = await acquireResource(targetRecord, target.logicalPackId);
    if (!acquired) {
      throw new Error("결제는 확인됐지만 내 에셋 보관을 완료하지 못했습니다. 주문 내역은 유지됩니다.");
    }
    setCompleted(true);
    return currentId;
  }, [acquireResource, id, record]);

  useEffect(() => {
    if (!authenticated || !id) return;
    const params = new URLSearchParams(location.search);
    const state = params.get("payment");
    if (state === "fail") {
      const message = params.get("message") || "결제가 완료되지 않았습니다.";
      setError(message.slice(0, 300));
      return;
    }
    if (state !== "success") return;

    const paymentKey = params.get("paymentKey") || "";
    const orderId = params.get("orderId") || "";
    const amount = Number(params.get("amount"));
    const callbackKey = paymentKey + ":" + orderId + ":" + String(amount);
    if (
      !paymentKey
      || !orderId
      || !Number.isInteger(amount)
      || amount < 1
      || callbackRef.current === callbackKey
    ) return;
    callbackRef.current = callbackKey;
    setWorking(true);
    setError(null);
    void confirmMarketplaceCommercePayment({ paymentKey, orderId, amount })
      .then(async (confirmed) => {
        setReceiptUrl(confirmed.receiptUrl);
        await completeAcquisition();
        navigate(checkoutHref(id), { replace: true });
      })
      .catch(async (caught) => {
        callbackRef.current = null;
        setError(await getApiErrorMessage(caught, "결제 승인 확인에 실패했습니다."));
      })
      .finally(() => setWorking(false));
  }, [authenticated, completeAcquisition, id, location.search, navigate]);

  const preparePayment = async () => {
    if (!id || !accepted || working) return;
    setWorking(true);
    setError(null);
    try {
      const nextOrder = await createMarketplaceCommerceOrder(id, crypto.randomUUID());
      setOrder(nextOrder);
      if (nextOrder.provider === "mock") {
        setWidgets(null);
        return;
      }
      if (!nextOrder.clientKey) {
        throw new Error("결제 클라이언트 키가 준비되지 않았습니다.");
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const factory = await loadTossPaymentsSdk();
      const nextWidgets = factory(nextOrder.clientKey).widgets({
        customerKey: factory.ANONYMOUS,
      });
      await nextWidgets.setAmount({ currency: "KRW", value: nextOrder.amount });
      await nextWidgets.renderPaymentMethods({
        selector: "#market-payment-methods",
        variantKey: "DEFAULT",
      });
      await nextWidgets.renderAgreement({
        selector: "#market-payment-agreement",
        variantKey: "AGREEMENT",
      });
      setWidgets(nextWidgets);
    } catch (caught) {
      setOrder(null);
      setWidgets(null);
      setError(await getApiErrorMessage(caught, "결제 준비에 실패했습니다."));
    } finally {
      setWorking(false);
    }
  };

  const requestTossPayment = async () => {
    if (!widgets || !order || working) return;
    setWorking(true);
    setError(null);
    try {
      const successUrl = new URL(checkoutHref(id), window.location.origin);
      successUrl.searchParams.set("payment", "success");
      const failUrl = new URL(checkoutHref(id), window.location.origin);
      failUrl.searchParams.set("payment", "fail");
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.productName,
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
      });
    } catch (caught) {
      setError(await getApiErrorMessage(caught, "결제창을 열지 못했습니다."));
      setWorking(false);
    }
  };

  const confirmMockPayment = async () => {
    if (!order?.mockPaymentKey || working) return;
    setWorking(true);
    setError(null);
    try {
      const confirmed = await confirmMarketplaceCommercePayment({
        paymentKey: order.mockPaymentKey,
        orderId: order.orderId,
        amount: order.amount,
      });
      setReceiptUrl(confirmed.receiptUrl);
      await completeAcquisition();
    } catch (caught) {
      setError(await getApiErrorMessage(caught, "개발용 결제 승인에 실패했습니다."));
    } finally {
      setWorking(false);
    }
  };

  const acquireWithoutPayment = async () => {
    if (!authenticated || working) return;
    setWorking(true);
    setError(null);
    try {
      await completeAcquisition();
    } catch (caught) {
      setError(await getApiErrorMessage(caught, "내 에셋에 추가하지 못했습니다."));
    } finally {
      setWorking(false);
    }
  };

  const license = record ? marketLicenseMeta(record.license) : null;
  const loading = quoteLoading || resourceLoading;

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <MarketNavHeader />
      <Link
        href={id ? "/market/resource/" + encodeURIComponent(id) : "/market/browse"}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-2 hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        리소스 상세로 돌아가기
      </Link>

      <div className="mx-auto mt-4 max-w-3xl">
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3 border-b border-line pb-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <WalletCards className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-fg">마켓 결제</h1>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">
                서버에서 상품과 금액을 다시 검증한 뒤 결제를 승인하고 계정 이용 권한을 부여합니다.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-fg-3">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              결제 정보를 확인하는 중…
            </div>
          ) : notFound || !record || !quote ? (
            <div className="py-10 text-center text-sm text-fg-2">
              결제할 리소스 정보를 찾을 수 없습니다.
            </div>
          ) : completed ? (
            <div className="space-y-4 py-8 text-center">
              <CheckCircle2 className="mx-auto size-12 text-good" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-bold text-fg">구매 및 내 에셋 추가가 완료됐습니다</h2>
                <p className="mt-1 text-sm text-fg-2">
                  계정에 이용 권한이 기록되어 다른 기기에서도 다시 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/market/library" className={buttonClass({ variant: "solid", size: "md" })}>
                  내 에셋 보기
                </Link>
                {receiptUrl ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass({ variant: "outline", size: "md" })}
                  >
                    영수증 보기
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pt-5">
              <section className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-fg">{record.name}</p>
                    <p className="mt-1 text-xs text-fg-3">
                      {record.publisher.name} · v{record.resourceVersion}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-3">
                      이용 비용
                    </p>
                    <p className="mt-0.5 text-lg font-extrabold text-fg">
                      {quote.checkoutRequired ? formatKrw(quote.amount) : "무료"}
                    </p>
                  </div>
                </div>
                {license ? (
                  <div className="mt-3 border-t border-line pt-3 text-xs text-fg-2">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                      {license.label}
                    </p>
                    <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                      {license.summary}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-accent/25 bg-accent/5 p-4">
                <p className="text-xs font-semibold text-fg">
                  현재 운영 정책 · {quote.operationMode === "free" ? "무료" : "유료"}
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-2">
                  {quote.policyNotice}
                </p>
              </section>

              {quote.checkoutRequired ? (
                <>
                  <section>
                    <p className="mb-2 text-xs font-semibold text-fg">지원 결제수단</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quote.paymentMethods.map((method) => (
                        <span
                          key={method}
                          className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[0.68rem] font-medium text-fg-2"
                        >
                          {PAYMENT_METHOD_LABELS[method]}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[0.65rem] leading-relaxed text-fg-3">
                      실제 표시되는 간편결제는 PG 계약, 브라우저·기기, 카드사 지원 여부에 따라 달라질 수 있습니다.
                    </p>
                  </section>

                  {!authenticated ? (
                    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-fg">
                      결제와 구매 권한을 계정에 연결하려면 먼저 로그인해 주세요.
                      <Link
                        href={"/login?returnTo=" + encodeURIComponent(checkoutHref(id))}
                        className="ml-2 font-semibold text-accent underline"
                      >
                        로그인
                      </Link>
                    </div>
                  ) : !quote.checkoutEnabled ? (
                    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-fg">
                      운영 모드는 유료지만 PG 키 또는 계약 설정이 아직 준비되지 않아 결제를 시작할 수 없습니다.
                    </div>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-panel p-3 text-xs text-fg-2">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={(event) => setAccepted(event.target.checked)}
                          className="mt-0.5 rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="leading-relaxed">
                          표시된 가격, 환불·이용 정책과 리소스 라이선스를 확인했으며 구매에 동의합니다.
                        </span>
                      </label>

                      {order?.provider === "toss" ? (
                        <div className="space-y-2">
                          <div id="market-payment-methods" className="min-h-24 rounded-xl border border-line bg-panel" />
                          <div id="market-payment-agreement" className="min-h-16 rounded-xl border border-line bg-panel" />
                        </div>
                      ) : null}

                      {!order ? (
                        <button
                          type="button"
                          disabled={!accepted || working}
                          onClick={() => void preparePayment()}
                          className={buttonClass({
                            variant: "solid",
                            size: "md",
                            className: "w-full gap-2 disabled:opacity-40",
                          })}
                        >
                          <CreditCard className="size-4" aria-hidden="true" />
                          {working ? "결제 준비 중…" : formatKrw(quote.amount) + " 결제 준비"}
                        </button>
                      ) : order.provider === "mock" ? (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => void confirmMockPayment()}
                          className={buttonClass({
                            variant: "solid",
                            size: "md",
                            className: "w-full",
                          })}
                        >
                          {working ? "승인 중…" : "개발용 모의 결제 승인"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!widgets || working}
                          onClick={() => void requestTossPayment()}
                          className={buttonClass({
                            variant: "solid",
                            size: "md",
                            className: "w-full gap-2 disabled:opacity-40",
                          })}
                        >
                          <CreditCard className="size-4" aria-hidden="true" />
                          {working ? "결제창 여는 중…" : formatKrw(order.amount) + " 결제하기"}
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={!authenticated || working}
                  onClick={() => void acquireWithoutPayment()}
                  className={buttonClass({
                    variant: "solid",
                    size: "md",
                    className: "w-full disabled:opacity-40",
                  })}
                >
                  {working ? "내 에셋에 추가 중…" : "무료로 내 에셋에 추가"}
                </button>
              )}

              {working && new URLSearchParams(location.search).get("payment") === "success" ? (
                <div role="status" className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-fg-2">
                  <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
                  결제 승인과 계정 권한을 확인하고 있습니다.
                </div>
              ) : null}

              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs leading-relaxed text-fg">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
