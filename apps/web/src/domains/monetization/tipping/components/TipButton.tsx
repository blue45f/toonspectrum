/**
 * TipButton.tsx
 *
 * 회차 후원 버튼. 게스트-퍼스트: 로그인 여부와 관계없이 눌러
 * 후원 선택지를 볼 수 있고, 실제 결제 단계에서만 로그인을 유도한다.
 */
import { Coins } from "lucide-react";
import { useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import { formatTipKrw } from "../models/tip-model";
import { useEpisodeTips } from "../hooks/use-episode-tips";
import { TipDialog } from "./TipDialog";

interface TipButtonProps {
  readonly episodeId: string;
  readonly titleId: string;
  readonly creatorId: string;
  readonly episodeLabel: string;
  readonly className?: string;
}

export function TipButton({
  episodeId,
  titleId,
  creatorId,
  episodeLabel,
  className,
}: TipButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { summary } = useEpisodeTips(episodeId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          buttonClass({ variant: "outline", size: "sm" }),
          "gap-1.5",
          className,
        )}
        aria-haspopup="dialog"
      >
        <Coins className="h-4 w-4" aria-hidden />
        <span>{t("tipping.button.label")}</span>
        {summary.tipCount > 0 && (
          <span
            className="rounded-full bg-fg/10 px-1.5 py-0.5 text-xs tabular-nums"
            aria-label={t("tipping.button.totalReceived", { amount: formatTipKrw(summary.totalKrw) })}
          >
            {formatTipKrw(summary.totalKrw)}
          </span>
        )}
      </button>
      {open && (
        <TipDialog
          episodeId={episodeId}
          titleId={titleId}
          creatorId={creatorId}
          episodeLabel={episodeLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
