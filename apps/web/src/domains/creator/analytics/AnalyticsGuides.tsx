import { ArrowRight, CalendarClock, Clapperboard, FlaskConical, Info, PenLine, RotateCcw, type LucideIcon } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export type AnalyticsSampleReason = "api-missing" | "server-sample" | "opted-in";

/**
 * 예시 데이터 안내 — 실제 집계처럼 보이지 않도록 대시보드 맨 위에 항상 보인다.
 * 어떤 이유로 예시를 보고 있는지와, 실제 지표로 바뀌는 조건·다음 행동을 함께 적는다.
 */
export function AnalyticsSampleBanner({
  reason,
  onRetryLive,
}: {
  reason: AnalyticsSampleReason;
  /** 사용자가 직접 예시를 켠 경우: 실제 데이터를 다시 불러오는 버튼. */
  onRetryLive?: () => void;
}) {
  const bt = useBilingual("CreatorAnalyticsSample");
  const why = reason === "api-missing"
    ? bt("실제 집계 서버가 아직 연결되지 않아 예시 데이터를 보여 줍니다.", "Live aggregation isn't connected yet, so sample data is shown.")
    : reason === "server-sample"
      ? bt("서버가 예시 데이터를 돌려주고 있습니다.", "The server is returning sample data.")
      : bt("연결을 기다리는 동안 화면 구성을 예시 데이터로 보고 있습니다.", "You're previewing the layout with sample data while the connection recovers.");

  return (
    <div
      role="note"
      aria-label={bt("예시 데이터 안내", "Sample data notice")}
      className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-accent">
          <Info size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-fg">
            {bt("예시 데이터입니다 · 실제 독자 수치가 아닙니다", "Sample data · not real reader numbers")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            {why}{" "}
            {bt("작품을 발행하고 독자 반응이 쌓이면 같은 화면이 실제 지표로 바뀝니다.", "Publish work and, as readers respond, this view switches to real metrics.")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {onRetryLive ? (
          <button type="button" onClick={onRetryLive} className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}>
            <RotateCcw size={14} aria-hidden />
            {bt("실제 데이터 다시 불러오기", "Reload live data")}
          </button>
        ) : null}
        <Link href="/studio/publish" className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}>
          {bt("작품 발행하러 가기", "Go publish")}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

interface NextAction {
  readonly icon: LucideIcon;
  readonly href: string;
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
}

const NEXT_ACTIONS: readonly NextAction[] = [
  {
    icon: PenLine,
    href: "/studio",
    title: ["이탈 회차 다듬기", "Refine drop-off episodes"],
    description: ["도입부·컷 흐름을 스튜디오에서 바로 고칩니다.", "Fix openings and pacing right in the Studio."],
  },
  {
    icon: FlaskConical,
    href: "/studio/growth",
    title: ["썸네일·제목 실험", "Test thumbnails & titles"],
    description: ["두 가지 안을 비교해 더 많이 열리는 쪽을 고릅니다.", "Compare two variants and keep the one opened more."],
  },
  {
    icon: Clapperboard,
    href: "/showcase/promo",
    title: ["홍보영상 만들기", "Make a promo video"],
    description: ["유입이 적은 경로에 맞춘 예고편·쇼츠를 만듭니다.", "Create trailers and shorts for weaker channels."],
  },
  {
    icon: CalendarClock,
    href: "/studio/publish",
    title: ["다음 회차 발행 준비", "Prepare the next release"],
    description: ["공개 범위·예약 시간·사전 검사를 한 흐름에서 확인합니다.", "Check visibility, schedule and preflight in one flow."],
  },
];

/** 지표를 본 뒤 이어서 할 일 — 분석이 막다른 화면이 되지 않게 제작·실험·홍보·발행으로 연결한다. */
export function AnalyticsNextActions() {
  const bt = useBilingual("CreatorAnalyticsNext");
  return (
    <section aria-labelledby="analytics-next-title" className="rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
      <p className="eyebrow text-accent">NEXT STEP</p>
      <h2 id="analytics-next-title" className="mt-1 text-base font-bold text-fg sm:text-lg">
        {bt("지표를 보고 이어서 할 일", "What to do next")}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {NEXT_ACTIONS.map(({ icon: Icon, href, title, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-4 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-fg group-hover:text-accent">
                  {bt(...title)}
                  <ArrowRight size={13} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-2">{bt(...description)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
