/**
 * TipDialog.tsx
 *
 * 후원 금액 선택 → 응원 메시지 → 결제 플로우 다이얼로그.
 * 금액 선택과 메시지는 로그인 없이도 입력할 수 있고,
 * "후원하기"를 누르는 결제 시점에 로그인을 유도한다 (게스트-퍼스트).
 */
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Coins, LoaderCircle, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  confirmTipPayment,
  createTipOrder,
  tipApiErrorMessage,
} from "../tipping-api";
import {
  formatTipKrw,
  isValidTipAmount,
  sanitizeTipMessage,
  TIP_AMOUNT_MAX_KRW,
  TIP_AMOUNT_MIN_KRW,
  TIP_AMOUNT_TIERS_KRW,
  TIP_MESSAGE_MAX_LENGTH,
} from "../models/tip-model";
import { recordTip } from "../models/tip-store";

type DialogPhase = "select" | "processing" | "success" | "error";

interface TipDialogProps {
  readonly episodeId: string;
  readonly titleId: string;
  readonly creatorId: string;
  readonly episodeLabel: string;
  readonly onClose: () => void;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tipreq-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function TipDialog({
  episodeId,
  titleId,
  creatorId,
  episodeLabel,
  onClose,
}: TipDialogProps) {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const amountInputId = useId();
  const messageInputId = useId();

  const [tierAmount, setTierAmount] = useState<number | null>(TIP_AMOUNT_TIERS_KRW[1] ?? null);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<DialogPhase>("select");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amountKrw = useMemo(() => {
    if (customAmount.trim().length > 0) {
      const parsed = Number(customAmount.replace(/[^0-9]/g, ""));
      return Number.isFinite(parsed) ? Math.round(parsed) : 0;
    }
    return tierAmount ?? 0;
  }, [customAmount, tierAmount]);

  const amountValid = isValidTipAmount(amountKrw);
  const authenticated = ready && status === "authenticated" && Boolean(session?.user.id);

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    if (value.trim().length > 0) setTierAmount(null);
  };

  const handleSubmit = async () => {
    if (!amountValid || phase === "processing") return;
    if (!authenticated) {
      // 게스트-퍼스트: 결제 시점에 로그인을 유도한다.
      requestAuthModalOpen({ reason: "protected-action", source: "episode-tip", mode: "login" });
      return;
    }
    setPhase("processing");
    setErrorMessage(null);
    try {
      const cleanMessage = sanitizeTipMessage(message);
      const order = await createTipOrder({
        episodeId,
        titleId,
        creatorId,
        amountKrw,
        message: cleanMessage,
        requestId: createRequestId(),
      });
      if (!order.checkoutEnabled) {
        throw new Error(order.disabledReason ?? t("tipping.dialog.checkoutDisabled"));
      }
      if (order.paymentKey) {
        await confirmTipPayment({
          paymentKey: order.paymentKey,
          orderId: order.orderId,
          amountKrw: order.amountKrw,
        });
      }
      recordTip({
        episodeId,
        titleId,
        creatorId,
        tipperId: session.user.id ?? "unknown",
        tipperName: session.user.name ?? session.user.email ?? t("tipping.dialog.anonymous"),
        amountKrw: order.amountKrw,
        message: cleanMessage ?? undefined,
        orderId: order.orderId,
      });
      setPhase("success");
    } catch (error) {
      setErrorMessage(tipApiErrorMessage(error));
      setPhase("error");
    }
  };

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-bg p-6 shadow-2xl"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-fg">
                {t("tipping.dialog.title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {t("tipping.dialog.episode", { episode: episodeLabel })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-lg p-1 text-muted transition hover:bg-fg/5 hover:text-fg"
              aria-label={t("tipping.dialog.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>

          {phase === "success" ? (
            <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-good" aria-hidden />
              <p className="text-base font-semibold text-fg">{t("tipping.dialog.successTitle")}</p>
              <p className="text-sm text-muted">
                {t("tipping.dialog.successBody", { amount: formatTipKrw(amountKrw) })}
              </p>
              <button
                type="button"
                onClick={onClose}
                className={cn(buttonClass({ variant: "solid" }), "mt-2")}
              >
                {t("tipping.dialog.done")}
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <fieldset>
                <legend className="text-sm font-semibold text-fg">
                  {t("tipping.dialog.amountLabel")}
                </legend>
                <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("tipping.dialog.amountLabel")}>
                  {TIP_AMOUNT_TIERS_KRW.map((tier) => {
                    const selected = tierAmount === tier && customAmount.trim().length === 0;
                    return (
                      <button
                        key={tier}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => { setTierAmount(tier); setCustomAmount(""); }}
                        className={cn(
                          "rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition",
                          selected
                            ? "border-accent bg-accent/10 text-fg"
                            : "border-line text-muted hover:border-fg/30 hover:text-fg",
                        )}
                      >
                        {formatTipKrw(tier)}
                      </button>
                    );
                  })}
                </div>
                <label htmlFor={amountInputId} className="mt-3 block text-xs text-muted">
                  {t("tipping.dialog.customAmountLabel", {
                    min: formatTipKrw(TIP_AMOUNT_MIN_KRW),
                    max: formatTipKrw(TIP_AMOUNT_MAX_KRW),
                  })}
                </label>
                <input
                  id={amountInputId}
                  type="text"
                  inputMode="numeric"
                  value={customAmount}
                  onChange={(event) => handleCustomAmountChange(event.target.value)}
                  placeholder={t("tipping.dialog.customAmountPlaceholder")}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </fieldset>

              <div>
                <label htmlFor={messageInputId} className="text-sm font-semibold text-fg">
                  {t("tipping.dialog.messageLabel")}
                </label>
                <textarea
                  id={messageInputId}
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, TIP_MESSAGE_MAX_LENGTH))}
                  rows={2}
                  placeholder={t("tipping.dialog.messagePlaceholder")}
                  className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-right text-xs tabular-nums text-muted">
                  {message.length}/{TIP_MESSAGE_MAX_LENGTH}
                </p>
              </div>

              {phase === "error" && errorMessage && (
                <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
                  {errorMessage}
                </p>
              )}

              {!authenticated && ready && (
                <p className="rounded-xl border border-line bg-fg/5 px-3 py-2 text-xs text-muted">
                  {t("tipping.dialog.loginNotice")}
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!amountValid || phase === "processing"}
                className={cn(buttonClass({ variant: "solid" }), "w-full gap-2")}
              >
                {phase === "processing" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Coins className="h-4 w-4" aria-hidden />
                )}
                {phase === "processing"
                  ? t("tipping.dialog.processing")
                  : authenticated
                    ? t("tipping.dialog.submit", { amount: formatTipKrw(amountKrw) })
                    : t("tipping.dialog.loginToTip")}
              </button>
              {!amountValid && amountKrw > 0 && (
                <p className="text-center text-xs text-bad">
                  {t("tipping.dialog.invalidAmount", {
                    min: formatTipKrw(TIP_AMOUNT_MIN_KRW),
                    max: formatTipKrw(TIP_AMOUNT_MAX_KRW),
                  })}
                </p>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
