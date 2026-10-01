/**
 * PayoutDialog.tsx
 *
 * 정산금 출금 요청 다이얼로그 (모의).
 * 실제 지급은 백엔드 정산 파이프라인에서 처리한다.
 */
import { BadgeCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import { formatKrw } from "./SettlementCard";

interface PayoutDialogProps {
  readonly open: boolean;
  readonly netKrw: number;
  readonly onClose: () => void;
}

const BANKS = ["국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "카카오뱅크", "토스뱅크"];

export function PayoutDialog({ open, netKrw, onClose }: PayoutDialogProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [bank, setBank] = useState(BANKS[0] ?? "");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setDone(false);
      setError(false);
      dialogRef.current?.querySelector("select")?.focus();
    }
  }, [open ]);

  if (!open) return null;

  const handleSubmit = () => {
    if (account.trim().length < 6 || holder.trim().length === 0) {
      setError(true);
      return;
    }
    setError(false);
    setDone(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("revenue.payout.title")}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-line bg-bg p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {done ? (
          <div className="py-6 text-center">
            <BadgeCheck className="mx-auto h-12 w-12 text-good" aria-hidden />
            <h2 className="mt-3 text-lg font-bold text-fg">{t("revenue.payout.doneTitle")}</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              {t("revenue.payout.doneBody", { amount: formatKrw(netKrw) })}
            </p>
            <button
              type="button"
              onClick={onClose}
              className={cn(buttonClass({ variant: "solid" }), "mt-5 w-full")}
            >
              {t("revenue.payout.close")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-fg">{t("revenue.payout.title")}</h2>
                <p className="mt-1 text-sm text-muted">
                  {t("revenue.payout.amount", { amount: formatKrw(netKrw) })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("revenue.payout.close")}
                className="rounded-lg p-1.5 text-muted hover:bg-fg/10 hover:text-fg"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="payout-bank" className="text-sm font-semibold text-fg">
                  {t("revenue.payout.bankLabel")}
                </label>
                <select
                  id="payout-bank"
                  value={bank}
                  onChange={(event) => setBank(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                >
                  {BANKS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="payout-account" className="text-sm font-semibold text-fg">
                  {t("revenue.payout.accountLabel")}
                </label>
                <input
                  id="payout-account"
                  type="text"
                  inputMode="numeric"
                  value={account}
                  onChange={(event) => setAccount(event.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder={t("revenue.payout.accountPlaceholder")}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="payout-holder" className="text-sm font-semibold text-fg">
                  {t("revenue.payout.holderLabel")}
                </label>
                <input
                  id="payout-holder"
                  type="text"
                  value={holder}
                  onChange={(event) => setHolder(event.target.value)}
                  placeholder={t("revenue.payout.holderPlaceholder")}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
                {t("revenue.payout.error")}
              </p>
            )}

            <p className="mt-3 text-xs leading-relaxed text-muted">
              {t("revenue.payout.mockNote")}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={cn(buttonClass({ variant: "outline" }), "flex-1")}
              >
                {t("revenue.payout.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className={cn(buttonClass({ variant: "solid" }), "flex-1")}
              >
                {t("revenue.payout.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
