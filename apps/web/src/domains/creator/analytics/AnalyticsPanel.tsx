import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

/**
 * 애널리틱스 패널 셸 — creator analytics 도메인 전용.
 * eyebrow + 제목(+ 선택 배지) + 본문 + 하단 인사이트 캡션.
 * catalog의 insights-components Panel에 대한 cross-domain import 대신 둔다.
 */
export function AnalyticsPanel({
  eyebrow,
  title,
  badge,
  children,
  insight,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  /** 제목 옆 보조 표시(예: "예시"). */
  badge?: ReactNode;
  children: ReactNode;
  /** 하단 한 줄 인사이트 (데이터 해석). */
  insight?: ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-line bg-card p-5 surface-hl sm:p-6",
        className
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5 text-accent">{eyebrow}</p>
          <h2 className="text-pretty text-base font-bold leading-tight tracking-tight text-fg sm:text-lg">
            {title}
          </h2>
        </div>
        {badge}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
      {insight != null && (
        <p className="mt-4 border-t border-line pt-3 text-[0.8rem] leading-relaxed text-fg-2">
          <span className="eyebrow mr-1.5 text-fg">
            {t("creatorAnalytics.insightLabel", "인사이트")}
          </span>
          {insight}
        </p>
      )}
    </section>
  );
}
