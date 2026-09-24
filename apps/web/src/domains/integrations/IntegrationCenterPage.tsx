import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  IntegrationError,
  IntegrationLoading,
  IntegrationPage,
  ProviderCard,
} from "./IntegrationUi";
import { INTEGRATION_CATEGORY_LABELS } from "./integration-platform-copy";
import type {
  IntegrationCategory,
  IntegrationProviderStatusKind,
} from "./integration-platform-types";
import { useIntegrationCatalog } from "./use-integration-catalog";

const ALL = "all" as const;
type CategoryFilter = IntegrationCategory | typeof ALL;
type StatusFilter = IntegrationProviderStatusKind | typeof ALL;

export function IntegrationCenterPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const { catalog, error, loading, refresh } = useIntegrationCatalog();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(ALL);
  const [status, setStatus] = useState<StatusFilter>(ALL);

  const visibleProviders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (catalog?.providers ?? []).filter((provider) => {
      if (category !== ALL && provider.category !== category) return false;
      if (status !== ALL && provider.status !== status) return false;
      if (!normalized) return true;
      return [provider.name, provider.summary, provider.id, ...provider.capabilities]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [catalog, category, query, status]);

  const counters = useMemo(() => {
    const providers = catalog?.providers ?? [];
    return {
      total: providers.length,
      ready: providers.filter((provider) => provider.status === "ready").length,
      manual: providers.filter((provider) => provider.status === "manual").length,
      pending: providers.filter((provider) => !provider.executable).length,
    };
  }, [catalog]);

  return (
    <IntegrationPage
      eyebrow={ko ? "설정 · 외부 시스템" : "Settings · external systems"}
      title={ko ? "통합 연동 센터" : "Integration center"}
      description={ko
        ? "저장소·업무·커뮤니케이션·제작·게시·권리·결제 공급자를 한곳에서 확인합니다. 계정 연결만 된 상태와 실제 실행 가능한 상태를 분리해 표시합니다."
        : "Review storage, work, communication, creation, publishing, trust and commerce providers in one place. Connected and executable states stay distinct."}
    >
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={ko ? "연동 상태 요약" : "Integration summary"}>
        {[
          [ko ? "전체 공급자" : "Providers", counters.total],
          [ko ? "즉시 사용 가능" : "Ready", counters.ready],
          [ko ? "수동 완주" : "Manual handoff", counters.manual],
          [ko ? "설정·승인 대기" : "Pending", counters.pending],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">{label}</p>
            <p className="mt-2 text-3xl font-bold text-fg">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-fg">{ko ? "안전한 연동 원칙" : "Safe integration policy"}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {ko
                ? "공식 OAuth·API·서명 Webhook만 사용하고, 외부 서비스 비밀번호 저장과 비공식 브라우저 자동화는 제공하지 않습니다. 키가 없거나 승인이 끝나지 않은 공급자는 실행하지 않습니다."
                : "Only official OAuth, APIs and signed webhooks are used. Password storage and unofficial browser automation are excluded, and inactive providers never execute."}
            </p>
          </div>
        </div>
      </section>
      <section className="mb-7 grid gap-3 rounded-2xl border border-line bg-card p-4 lg:grid-cols-[1fr_14rem_14rem_auto]">
        <label className="relative block">
          <span className="sr-only">{ko ? "연동 검색" : "Search integrations"}</span>
          <Search className="pointer-events-none absolute left-3 top-3 text-fg-3" size={17} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={ko ? "이름·기능·공급자 검색" : "Search name or capability"}
            className="min-h-11 w-full rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm text-fg"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.currentTarget.value as CategoryFilter)}
          className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg"
          aria-label={ko ? "분류" : "Category"}
        >
          <option value={ALL}>{ko ? "모든 분류" : "All categories"}</option>
          {catalog?.categories.map((item) => (
            <option key={item} value={item}>{INTEGRATION_CATEGORY_LABELS[item]}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}
          className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg"
          aria-label={ko ? "상태" : "Status"}
        >
          <option value={ALL}>{ko ? "모든 상태" : "All states"}</option>
          <option value="ready">{ko ? "사용 가능" : "Ready"}</option>
          <option value="manual">{ko ? "수동 완주" : "Manual"}</option>
          <option value="configuration-required">{ko ? "설정 필요" : "Configuration required"}</option>
          <option value="approval-required">{ko ? "승인 필요" : "Approval required"}</option>
        </select>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:text-fg"
        >
          <RefreshCw size={16} aria-hidden /> {ko ? "새로고침" : "Refresh"}
        </button>
      </section>

      {loading ? <IntegrationLoading /> : null}
      {error ? <IntegrationError message={error} onRetry={refresh} /> : null}
      {catalog && visibleProviders.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-fg-2">
          {ko ? "조건에 맞는 연동이 없습니다." : "No integrations match the filters."}
        </div>
      ) : null}
      {catalog && visibleProviders.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={ko ? "외부 연동 목록" : "External integrations"}>
          {visibleProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </section>
      ) : null}
    </IntegrationPage>
  );
}
