import { Inbox, RotateCcw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import "../shell/admin-visual-v2.css";

import { adminButtonClass } from "./admin-ui-utils";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export const adminInputClass =
  "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-accent/60";

/**
 * 관리자 KPI 한 칸 (G-0): eyebrow 라벨 → 큰 숫자(numeral) → 증감·보조 설명 순서.
 * 증감(delta)은 비교 데이터가 실제로 있을 때만 넘긴다 — 없는 화면에서 가짜 증감을 만들지 않는다.
 */
export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: { direction: "up" | "down"; text: string; sentiment: "good" | "bad" | "neutral" };
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fg-3">{label}</dt>
      <dd className="numeral text-2xl text-fg">{value}</dd>
      {delta ? (
        <dd
          className={cn(
            "text-[0.7rem] font-semibold",
            delta.sentiment === "good"
              ? "text-good"
              : delta.sentiment === "bad"
                ? "text-bad"
                : "text-fg-3",
          )}
        >
          <span aria-hidden="true">{delta.direction === "up" ? "▲" : "▼"}</span> {delta.text}
        </dd>
      ) : null}
      {hint ? <dd className="text-[0.7rem] leading-4 text-fg-3">{hint}</dd> : null}
    </div>
  );
}

export function StatGroup({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5 text-fg-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="text-sm font-semibold">{label}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </dl>
    </section>
  );
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-xs font-medium text-fg-3">{label}</span>
      {children}
    </label>
  );
}

export function AdminNotice({
  title,
  body,
  onRetry,
  retryLabel,
}: {
  title: string;
  body: string;
  /** 불러오기 실패처럼 다시 시도할 수 있는 오류일 때만 넘긴다. */
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useBilingual("admin-ui");
  return (
    <section data-admin-notice="true" className="rounded-2xl border border-line bg-card p-6">
      <div className="admin-notice-visual" aria-hidden="true">
        <span className="admin-notice-emblem"><ShieldCheck size={24} strokeWidth={1.8} /></span>
        <span>ADMIN OPERATIONS</span>
      </div>
      <div className="admin-notice-copy">
        <p className="admin-notice-kicker">TOONSTUDIO CONTROL CENTER</p>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-3">{body}</p>
        {onRetry ? (
          <button type="button" className={cn(adminButtonClass("ghost"), "mt-4")} onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" />
            {retryLabel ?? t("다시 시도", "Retry")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 관리자 목록 빈 상태: 성공했지만 비어 있는 결과를 오류와 구분해 보여준다.
 * 아이콘·제목·설명·액션(자식) 순서로, 테이블 빈 셀 텍스트만 두는 패턴을 대체한다.
 */
export function AdminEmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card/40 px-5 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-raised text-fg-3" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm leading-relaxed text-fg-3">{description}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function AdminSpinner() {
  const t = useBilingual("admin-ui");
  return (
    <div className="flex min-h-[30vh] items-center justify-center" role="status" aria-label={t("불러오는 중", "Loading")}>
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

/**
 * 관리자 섹션 카드: 화면마다 반경·배경이 제각각이던 수제 섹션을 한 규격으로 통일한다.
 * (웨이브9 실사: Revenue 2xl, SupporterPayments xl 등 혼재 확인)
 * 랜드마크가 아니라 카드 컨테이너라 div로 둔다 — 제목 위계는 소비 화면이 소유한다.
 */
export function AdminCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("rounded-2xl border border-line bg-card p-5", className)}>{children}</div>;
}

/** 관리자 표 래퍼: 가로 스크롤·반경·테두리 규격 통일용. */
export function AdminTableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-2xl border border-line", className)}>{children}</div>;
}

/**
 * 상태 배지 (G-0): 테두리만 있는 고리가 아니라 톤 배경을 채운 칩으로 통일한다.
 * 상태 값의 의미 매핑은 기존과 동일하게 유지하고, 표현만 바꾼다.
 * 표시 문구는 호출부가 지역화한 label을 우선 쓰고, 없으면 원시 값을 그대로 보인다.
 */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone =
    status === "paid" || status === "DONE"
      ? "bg-good/15 text-good"
      : status === "approved" || status === "READY"
        ? "bg-cool/15 text-cool"
        : status === "pending" || status === "WAITING_FOR_DEPOSIT"
          ? "bg-warn/15 text-warn"
          : status === "rejected" || status === "revoked" || status === "CANCELED"
            ? "bg-bad/15 text-bad"
            : "bg-raised text-fg-2";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", tone)}>
      {label ?? status}
    </span>
  );
}
