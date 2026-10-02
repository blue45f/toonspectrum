/**
 * PaywallGate.tsx
 *
 * 회차 콘텐츠를 감싸는 롤링 페이월 게이트.
 * 접근 가능하면 children을 그대로 보여주고,
 * 잠겨 있으면 서포터 유도 UI를 보여준다 (게스트-퍼스트:
 * 잠금 안내와 카운트다운은 로그인 없이 볼 수 있다).
 */
import { Crown, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";

import type { SupporterEvidence } from "../models/paywall-model";
import { useEpisodeAccess } from "../hooks/use-episode-access";

interface PaywallGateProps {
  readonly titleId: string;
  readonly publishedAt: string;
  readonly evidence?: SupporterEvidence;
  /** 서포터 되기 링크 (멤버십/후원 안내 페이지). */
  readonly supporterHref?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function PaywallGate({
  titleId,
  publishedAt,
  evidence,
  supporterHref = "/memberships",
  children,
  className,
}: PaywallGateProps) {
  const t = useT();
  const access = useEpisodeAccess({ titleId, publishedAt, evidence });

  if (access.accessible) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel/50 px-6 py-10 text-center",
        className,
      )}
      role="region"
      aria-label={t("paywall.gate.lockedTitle")}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
        <Lock className="h-6 w-6 text-accent" aria-hidden />
      </span>
      <h3 className="text-base font-bold text-fg">{t("paywall.gate.lockedTitle")}</h3>
      <p className="max-w-sm text-sm text-muted">{t("paywall.gate.lockedBody")}</p>
      {access.daysUntilFree !== null && (
        <p className="rounded-full bg-fg/5 px-3 py-1 text-sm font-semibold tabular-nums text-fg">
          {t("paywall.gate.freeIn", { days: access.daysUntilFree })}
        </p>
      )}
      <Link
        href={supporterHref}
        className={cn(buttonClass({ variant: "solid" }), "mt-1 gap-1.5")}
      >
        <Crown className="h-4 w-4" aria-hidden />
        {t("paywall.gate.becomeSupporter")}
      </Link>
      <p className="text-xs text-muted">{t("paywall.gate.supporterNote")}</p>
    </div>
  );
}
