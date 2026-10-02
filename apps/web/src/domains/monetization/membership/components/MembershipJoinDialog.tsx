/**
 * MembershipJoinDialog.tsx
 *
 * 팬용 멤버십 가입 플로우. 티어 소개는 로그인 없이 볼 수 있고
 * 가입(결제) 단계에서 로그인을 유도한다 (게스트-퍼스트).
 */
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Crown, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  confirmMembershipSubscriptionPayment,
  createMembershipSubscriptionOrder,
  membershipApiErrorMessage,
} from "../membership-api";
import {
  formatMembershipKrw,
  type MembershipTier,
} from "../models/membership-model";
import { subscribeToTier } from "../models/membership-store";

type JoinPhase = "intro" | "processing" | "success" | "error";

interface MembershipJoinDialogProps {
  readonly tier: MembershipTier;
  readonly creatorName: string;
  readonly onClose: () => void;
  readonly onJoined: () => void;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msreq-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function MembershipJoinDialog({
  tier,
  creatorName,
  onClose,
  onJoined,
}: MembershipJoinDialogProps) {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [phase, setPhase] = useState<JoinPhase>("intro");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const authenticated = ready && status === "authenticated" && Boolean(session?.user.id);

  const handleJoin = async () => {
    if (phase === "processing") return;
    if (!authenticated) {
      requestAuthModalOpen({ reason: "protected-action", source: "membership-join", mode: "login" });
      return;
    }
    setPhase("processing");
    setErrorMessage(null);
    try {
      const order = await createMembershipSubscriptionOrder({
        tierId: tier.id,
        creatorId: tier.creatorId,
        monthlyPriceKrw: tier.monthlyPriceKrw,
        requestId: createRequestId(),
      });
      if (!order.checkoutEnabled) {
        throw new Error(order.disabledReason ?? t("membership.join.checkoutDisabled"));
      }
      if (order.paymentKey) {
        await confirmMembershipSubscriptionPayment({
          paymentKey: order.paymentKey,
          orderId: order.orderId,
          amountKrw: order.monthlyPriceKrw,
        });
      }
      subscribeToTier({
        tier,
        memberId: session.user.id ?? "unknown",
      });
      setPhase("success");
      onJoined();
    } catch (error) {
      setErrorMessage(membershipApiErrorMessage(error));
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
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15">
                <Crown className="h-6 w-6 text-accent" aria-hidden />
              </span>
              <div>
                <Dialog.Title className="text-lg font-bold text-fg">{tier.name}</Dialog.Title>
                <Dialog.Description className="text-sm text-muted">
                  {t("membership.join.creator", { name: creatorName })}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              className="rounded-lg p-1 text-muted transition hover:bg-fg/5 hover:text-fg"
              aria-label={t("membership.join.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>

          {phase === "success" ? (
            <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-good" aria-hidden />
              <p className="text-base font-semibold text-fg">{t("membership.join.successTitle")}</p>
              <p className="text-sm text-muted">{t("membership.join.successBody", { name: tier.name })}</p>
              <button
                type="button"
                onClick={onClose}
                className={cn(buttonClass({ variant: "solid" }), "mt-2")}
              >
                {t("membership.join.done")}
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {tier.description && (
                <p className="text-sm text-muted">{tier.description}</p>
              )}
              <ul className="space-y-1.5">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-fg">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden />
                    <span>
                      <strong className="font-semibold">{t(`membership.perk.${perk}`)}</strong>
                      <span className="text-muted"> — {t(`membership.perk.${perk}Description`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-line bg-fg/5 px-4 py-3">
                <p className="text-sm text-muted">{t("membership.join.priceLabel")}</p>
                <p className="text-xl font-bold tabular-nums text-fg">
                  {t("membership.join.price", { amount: formatMembershipKrw(tier.monthlyPriceKrw) })}
                </p>
                <p className="mt-0.5 text-xs text-muted">{t("membership.join.recurringNote")}</p>
              </div>

              {phase === "error" && errorMessage && (
                <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
                  {errorMessage}
                </p>
              )}

              {!authenticated && ready && (
                <p className="rounded-xl border border-line bg-fg/5 px-3 py-2 text-xs text-muted">
                  {t("membership.join.loginNotice")}
                </p>
              )}

              <button
                type="button"
                onClick={handleJoin}
                disabled={phase === "processing"}
                className={cn(buttonClass({ variant: "solid" }), "w-full gap-2")}
              >
                {phase === "processing" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {phase === "processing"
                  ? t("membership.join.processing")
                  : authenticated
                    ? t("membership.join.submit")
                    : t("membership.join.loginToJoin")}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
