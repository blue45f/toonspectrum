import { ArrowUpRight, CheckCircle2, CircleAlert, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Container } from "@/shared/components/section";

import { INTEGRATION_CATEGORY_LABELS } from "./integration-platform-copy";
import type { IntegrationProviderStatus } from "./integration-platform-types";

const NAVIGATION = [
  ["/settings/integrations", "연동 센터"],
  ["/automation", "자동화"],
  ["/publish", "게시·배포"],
  ["/developers", "개발자"],
] as const;

const STATUS_LABELS: Readonly<Record<IntegrationProviderStatus["status"], string>> = {
  ready: "사용 가능",
  manual: "수동 완주 가능",
  "configuration-required": "운영 설정 필요",
  "approval-required": "공급자 승인 필요",
};

export function IntegrationPage({
  eyebrow,
  title,
  description,
  children,
  wide = true,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const location = useLocation();
  return (
    <Container size={wide ? "wide" : "prose"} className="py-8 sm:py-14">
      <header className="mb-7">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-pretty text-sm leading-7 text-fg-2 sm:text-base">
          {description}
        </p>
      </header>
      <nav className="mb-8 flex gap-2 overflow-x-auto pb-1" aria-label="외부 연동">
        {NAVIGATION.map(([href, label]) => {
          const active = location.pathname === href;
          return (
            <Link
              key={href}
              to={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:text-fg"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </Container>
  );
}

export function ProviderCard({ provider }: { provider: IntegrationProviderStatus }) {
  const ready = provider.status === "ready" || provider.status === "manual";
  const Icon = ready ? CheckCircle2 : CircleAlert;
  return (
    <article className="flex min-h-64 flex-col rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-3">
            {INTEGRATION_CATEGORY_LABELS[provider.category]}
          </p>
          <h2 className="mt-1 text-lg font-bold text-fg">{provider.name}</h2>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
          <Icon size={13} aria-hidden /> {STATUS_LABELS[provider.status]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-fg-2">{provider.summary}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {provider.capabilities.slice(0, 5).map((capability) => (
          <span key={capability} className="rounded-full border border-line px-2 py-1 text-[0.7rem] text-fg-3">
            {capability}
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-fg-3">{provider.statusReason}</p>
      <div className="mt-auto pt-5">
        {provider.existingPath ? (
          <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-accent" to={provider.existingPath}>
            기존 기능 열기 <ArrowUpRight size={14} aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-fg-2">
            <Settings2 size={14} aria-hidden /> {provider.connectionMode}
          </span>
        )}
      </div>
    </article>
  );
}

export function IntegrationLoading({ message = "연동 상태를 확인하고 있습니다." }: { message?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6 text-sm text-fg-2" aria-busy="true">
      {message}
    </div>
  );
}

export function IntegrationError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/5 p-6">
      <p className="text-sm text-danger">{message}</p>
      <button type="button" className="mt-4 rounded-xl border border-line px-3 py-2 text-sm font-semibold" onClick={onRetry}>
        다시 확인
      </button>
    </div>
  );
}
