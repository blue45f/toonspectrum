import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type {
  SupporterPaymentPublicEntry,
  SupporterVisibility,
} from "@toonspectrum/core/supporter-payment";

import {
  confirmSupporterPayment,
  createSupporterPaymentOrder,
  getSupporterPaymentConfig,
  type SupporterPaymentConfigResponse,
  type SupporterPaymentOrderResponse,
} from "./supporter-payment-api";
import {
  loadTossPaymentsSdk,
  type TossWidgetControl,
  type TossWidgets,
} from "./supporter-toss-sdk";

import { getApiErrorMessage } from "@/infrastructure/api";
import { useT } from "@/shared/lib/i18n";

const DEFAULT_AMOUNT = 5_000;
const formatWon = (value: number) => `₩${value.toLocaleString("ko-KR")}`;
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export function SupporterCheckoutPanel() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<SupporterPaymentConfigResponse | null>(
    null,
  );
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [supporterName, setSupporterName] = useState("");
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] =
    useState<SupporterVisibility>("anonymous");
  const [showAmount, setShowAmount] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [order, setOrder] = useState<SupporterPaymentOrderResponse | null>(
    null,
  );
  const [result, setResult] = useState<SupporterPaymentPublicEntry | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const controlsRef = useRef<TossWidgetControl[]>([]);
  const confirmKeyRef = useRef("");

  useEffect(() => {
    getSupporterPaymentConfig()
      .then(setConfig)
      .catch(
        (requestError) =>
          void getApiErrorMessage(
            requestError,
            t("supportUs.checkout.configError"),
          ).then(setError),
      );
  }, [t]);
  useEffect(() => {
    const flow = searchParams.get("payment");
    if (flow === "fail") {
      const code = searchParams.get("code") ?? "PAYMENT_FAILED";
      setError(`${t("supportUs.checkout.failed")}: ${code.slice(0, 80)}`);
      return;
    }
    if (flow !== "success") return;
    const paymentKey = searchParams.get("paymentKey") ?? "";
    const orderId = searchParams.get("orderId") ?? "";
    const amountValue = Number(searchParams.get("amount"));
    const confirmKey = `${paymentKey}:${orderId}:${amountValue}`;
    if (
      !paymentKey ||
      !orderId ||
      !Number.isInteger(amountValue) ||
      confirmKeyRef.current === confirmKey
    )
      return;
    confirmKeyRef.current = confirmKey;
    setBusy(true);
    setError("");
    confirmSupporterPayment({ paymentKey, orderId, amount: amountValue })
      .then((entry) => {
        setResult(entry);
        setSearchParams({}, { replace: true });
      })
      .catch(
        (requestError) =>
          void getApiErrorMessage(
            requestError,
            t("supportUs.checkout.confirmError"),
          ).then(setError),
      )
      .finally(() => setBusy(false));
  }, [searchParams, setSearchParams, t]);
  const destroyWidgets = async () => {
    await Promise.all(
      controlsRef.current.map(async (control) => {
        try {
          await control.destroy?.();
        } catch {
          // Best-effort cleanup; a page redirect may already have torn down the iframe.
        }
      }),
    );
    controlsRef.current = [];
    widgetsRef.current = null;
    setWidgetReady(false);
  };

  const resetCheckout = () => {
    void destroyWidgets();
    setOrder(null);
    setResult(null);
    setError("");
  };

  const prepare = async () => {
    if (!config?.enabled || !config.clientKey || busy) return;
    if (!acceptedTerms) {
      setError(t("supportUs.checkout.termsRequired"));
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      await destroyWidgets();
      const created = await createSupporterPaymentOrder({
        amount,
        supporterName,
        message,
        visibility,
        showAmount,
        showMessage,
        acceptedTerms: true,
        website: "",
      });
      setOrder(created);
      await nextFrame();
      const TossPayments = await loadTossPaymentsSdk();
      const widgets = TossPayments(created.clientKey).widgets({
        customerKey: TossPayments.ANONYMOUS,
      });
      widgetsRef.current = widgets;
      await widgets.setAmount({ currency: "KRW", value: created.amount });
      const [methods, agreement] = await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#supporter-payment-methods",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#supporter-payment-agreement",
          variantKey: "AGREEMENT",
        }),
      ]);
      controlsRef.current = [methods, agreement];
      setWidgetReady(true);
    } catch (requestError) {
      setError(
        await getApiErrorMessage(
          requestError,
          t("supportUs.checkout.prepareError"),
        ),
      );
      setOrder(null);
    } finally {
      setBusy(false);
    }
  };
  const requestPayment = async () => {
    if (!order || !widgetsRef.current || !widgetReady || busy) return;
    setBusy(true);
    setError("");
    try {
      const returnUrl = `${window.location.origin}/support-us`;
      await widgetsRef.current.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${returnUrl}?payment=success`,
        failUrl: `${returnUrl}?payment=fail`,
      });
    } catch (requestError) {
      setError(
        await getApiErrorMessage(
          requestError,
          t("supportUs.checkout.requestError"),
        ),
      );
      setBusy(false);
    }
  };

  const minAmount = config?.minAmount ?? 1_000;
  const maxAmount = config?.maxAmount ?? 1_000_000;
  const inputLocked = Boolean(order);

  return (
    <section
      id="supporter-checkout"
      className="mt-6 rounded-3xl border border-accent/30 bg-card p-5 shadow-sm sm:p-7"
      aria-labelledby="supporter-checkout-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            SECURE CHECKOUT
          </p>
          <h2
            id="supporter-checkout-title"
            className="mt-1 text-2xl font-bold text-fg"
          >
            {t("supportUs.checkout.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
            {t("supportUs.checkout.description")}
          </p>
        </div>
        {config?.mode === "test" ? (
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-fg-2">
            {t("supportUs.checkout.testBadge")}
          </span>
        ) : null}
      </div>

      {!config ? (
        <p className="mt-6 text-sm text-fg-3">
          {t("supportUs.checkout.loading")}
        </p>
      ) : !config.enabled ? (
        <div className="mt-6 rounded-2xl border border-line bg-panel/60 p-5">
          <p className="font-bold text-fg">
            {t("supportUs.checkout.disabledTitle")}
          </p>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {t("supportUs.checkout.disabledBody")}
          </p>
        </div>
      ) : null}

      {result ? (
        <div
          role="status"
          className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft p-5"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={22}
              className="mt-0.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-fg">
                {result.status === "WAITING_FOR_DEPOSIT"
                  ? t("supportUs.checkout.waitingDeposit")
                  : t("supportUs.checkout.success")}
              </p>
              <p className="mt-1 text-sm text-fg-2">
                {formatWon(result.amount)} ·{" "}
                {result.method || t("supportUs.checkout.paymentMethod")}
              </p>
              {result.receiptUrl ? (
                <a
                  href={result.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline"
                >
                  {t("supportUs.checkout.receipt")}{" "}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {config?.enabled && !result ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <div>
              <label
                className="text-sm font-bold text-fg"
                htmlFor="support-amount"
              >
                {t("supportUs.checkout.amount")}
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {config.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={inputLocked}
                    onClick={() => setAmount(preset)}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${
                      amount === preset
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-accent/40"
                    } disabled:opacity-60`}
                  >
                    {formatWon(preset)}
                  </button>
                ))}
              </div>
              <input
                id="support-amount"
                type="number"
                min={minAmount}
                max={maxAmount}
                step={1000}
                disabled={inputLocked}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-fg-3">
                {formatWon(minAmount)} – {formatWon(maxAmount)}
              </p>
            </div>
            <fieldset disabled={inputLocked}>
              <legend className="text-sm font-bold text-fg">
                {t("supportUs.checkout.visibility")}
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["anonymous", "name"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-fg-2"
                  >
                    <input
                      type="radio"
                      name="support-visibility"
                      checked={visibility === value}
                      onChange={() => {
                        setVisibility(value);
                        if (value === "anonymous") {
                          setShowAmount(false);
                          setShowMessage(false);
                        }
                      }}
                    />
                    {t(
                      value === "anonymous"
                        ? "supportUs.checkout.anonymous"
                        : "supportUs.checkout.named",
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

            {visibility === "name" ? (
              <label className="block text-sm font-bold text-fg">
                {t("supportUs.checkout.name")}
                <input
                  type="text"
                  maxLength={80}
                  disabled={inputLocked}
                  value={supporterName}
                  onChange={(event) => setSupporterName(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-normal text-fg outline-none focus:border-accent"
                />
              </label>
            ) : null}
            {visibility === "name" ? (
              <div className="grid gap-2 rounded-xl border border-line bg-panel/60 p-3">
                <p className="text-xs font-semibold text-fg-2">{t("supportUs.checkout.publicOptions")}</p>
                <label className="flex items-center gap-2 text-xs text-fg-3">
                  <input type="checkbox" disabled={inputLocked} checked={showAmount} onChange={(event) => setShowAmount(event.target.checked)} />
                  {t("supportUs.checkout.showAmount")}
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-3">
                  <input type="checkbox" disabled={inputLocked} checked={showMessage} onChange={(event) => setShowMessage(event.target.checked)} />
                  {t("supportUs.checkout.showMessage")}
                </label>
              </div>
            ) : null}
            <label className="block text-sm font-bold text-fg">
              {t("supportUs.checkout.message")}
              <textarea
                maxLength={500}
                rows={3}
                disabled={inputLocked}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("supportUs.checkout.messagePlaceholder")}
                className="mt-2 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent"
              />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-line bg-panel/70 p-3 text-sm leading-6 text-fg-2">
              <input
                type="checkbox"
                className="mt-1"
                disabled={inputLocked}
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>{t("supportUs.checkout.terms")}</span>
            </label>

            {!order ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void prepare()}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-60"
              >
                <CreditCard size={17} aria-hidden="true" />
                {busy
                  ? t("supportUs.checkout.preparing")
                  : t("supportUs.checkout.prepare")}
              </button>
            ) : null}
            {order ? (
              <button
                type="button"
                disabled={busy}
                onClick={resetCheckout}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg-2 hover:text-fg disabled:opacity-60"
              >
                <RotateCcw size={15} aria-hidden="true" />
                {t("supportUs.checkout.change")}
              </button>
            ) : null}
          </div>

          <div className="min-w-0 rounded-2xl border border-line bg-panel/35 p-3 sm:p-5">
            {order ? (
              <>
                <p className="mb-3 text-sm font-bold text-fg">
                  {t("supportUs.checkout.methods")}
                </p>
                <div id="supporter-payment-methods" className="min-h-24" />
                <div
                  id="supporter-payment-agreement"
                  className="mt-3 min-h-16"
                />
                <button
                  type="button"
                  disabled={!widgetReady || busy}
                  onClick={() => void requestPayment()}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-60"
                >
                  <ShieldCheck size={17} aria-hidden="true" />
                  {busy
                    ? t("supportUs.checkout.processing")
                    : `${formatWon(order.amount)} ${t("supportUs.checkout.pay")}`}
                </button>
              </>
            ) : (
              <div className="grid min-h-56 place-items-center px-4 text-center">
                <div>
                  <CreditCard
                    size={28}
                    className="mx-auto text-accent"
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-bold text-fg">
                    {t("supportUs.checkout.beforeMethods")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-fg-3">
                    {t("supportUs.checkout.beforeMethodsBody")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-fg-3">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t("supportUs.checkout.security")}
      </p>
    </section>
  );
}
