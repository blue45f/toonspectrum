/**
 * TitleEarlyAccessNotice.tsx
 *
 * `/title/:slug`에 삽입되는 얼리 액세스 안내.
 * 창작자가 이 작품에 서포터 선공개를 켜 두었을 때만 표시된다.
 */
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import type { EarlyAccessPolicy } from "../models/paywall-model";
import {
  getEarlyAccessPolicy,
  subscribePaywallStore,
} from "../models/paywall-store";

interface TitleEarlyAccessNoticeProps {
  readonly titleId: string;
}

export function TitleEarlyAccessNotice({ titleId }: TitleEarlyAccessNoticeProps) {
  const t = useT();
  const [policy, setPolicy] = useState<EarlyAccessPolicy | null>(() =>
    getEarlyAccessPolicy(titleId),
  );

  useEffect(() => {
    const refresh = () => setPolicy(getEarlyAccessPolicy(titleId));
    refresh();
    return subscribePaywallStore(refresh);
  }, [titleId]);

  if (!policy || !policy.enabled) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-accent/30 bg-accent/5 p-4"
      role="note"
      aria-label={t("paywall.titleNotice.label")}
    >
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm font-semibold text-fg">{t("paywall.titleNotice.title")}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {t("paywall.titleNotice.body", { days: policy.earlyAccessDays })}
      </p>
    </div>
  );
}
