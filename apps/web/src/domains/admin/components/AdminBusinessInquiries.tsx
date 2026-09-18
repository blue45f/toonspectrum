import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  BUSINESS_INQUIRY_STATUSES,
  BUSINESS_INQUIRY_STATUS_LABELS,
  BUSINESS_INQUIRY_TYPE_LABELS,
  type BusinessInquiryEntry,
  type BusinessInquiryPage,
  type BusinessInquiryStatus,
} from "@toonspectrum/core/business-inquiry";

import { api, getApiErrorMessage } from "@/infrastructure/api";

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function InquiryCard({
  item,
  onStatusChange,
  disabled,
}: {
  item: BusinessInquiryEntry;
  onStatusChange: (id: string, status: BusinessInquiryStatus) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
              {BUSINESS_INQUIRY_TYPE_LABELS[item.type]}
            </span>
            <span className="text-xs text-fg-3">{formatDate(item.createdAt)}</span>
          </div>
          <h2 className="mt-3 text-lg font-bold text-fg">
            {item.organization || translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "개인 문의")} · {item.contactName}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            <a href={formatI18nTemplate(translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "mailto:{v0}"), { v0: String(item.email) })} className="font-semibold text-accent hover:underline">
              {item.email}
            </a>
            {item.website ? (
              <a
                href={item.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-accent hover:underline"
              >
                {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "웹사이트 ")}<ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-fg-3">
          {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "처리 상태")}<select
            value={item.status}
            disabled={disabled}
            onChange={(event) => void onStatusChange(item.id, event.target.value as BusinessInquiryStatus)}
            className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
          >
            {BUSINESS_INQUIRY_STATUSES.map((status) => (
              <option key={status} value={status}>{BUSINESS_INQUIRY_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-4 whitespace-pre-wrap rounded-xl border border-line/70 bg-panel/55 p-4 text-sm leading-7 text-fg-2">
        {item.message}
      </p>
      <p className="mt-3 text-xs text-fg-3">
        {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "접수 경로: ")}{item.sourcePath || "/business"} {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "· 문의 ID: ")}{item.id}
      </p>
    </article>
  );
}

export function AdminBusinessInquiries() {
  const [status, setStatus] = useState<BusinessInquiryStatus | "all">("all");
  const [page, setPage] = useState<BusinessInquiryPage>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<BusinessInquiryPage>("/admin/business-inquiries", {
        params: { status: status === "all" ? undefined : status, limit: 100 },
      });
      setPage(result);
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, "비즈니스 문의를 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, nextStatus: BusinessInquiryStatus) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await api.post<BusinessInquiryEntry>(`/admin/business-inquiries/${encodeURIComponent(id)}/status`, {
        status: nextStatus,
      });
      setPage((current) => ({
        ...current,
        items: current.items.map((item) => item.id === id ? updated : item),
      }));
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, "문의 상태를 변경하지 못했어요."));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="business-inquiries-title">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-card p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "Private business inbox")}</p>
          <h1 id="business-inquiries-title" className="mt-1 text-2xl font-bold text-fg">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "비즈니스 문의")}</h1>
          <p className="mt-2 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "투자·IR, 제휴, 콘텐츠/IP, 후원·스폰서십 문의를 비공개로 처리합니다.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-fg-3">
            {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "상태 필터")}<select
              value={status}
              onChange={(event) => setStatus(event.target.value as BusinessInquiryStatus | "all")}
              className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent"
            >
              <option value="all">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "전체 (")}{page.total})</option>
              {BUSINESS_INQUIRY_STATUSES.map((item) => (
                <option key={item} value={item}>{BUSINESS_INQUIRY_STATUS_LABELS[item]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg-2 hover:border-accent/50 hover:text-accent disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "en", "animate-spin") : ""} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "새로고침")}</button>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {loading && page.items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-fg-3">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "문의함을 불러오는 중…")}</div>
      ) : page.items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-10 text-center">
          <Inbox size={30} className="mx-auto text-fg-3" aria-hidden="true" />
          <p className="mt-3 font-semibold text-fg">{translateCurrentStaticSourceText("domains.admin.components.AdminBusinessInquiries", "ko", "해당 상태의 문의가 없습니다.")}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {page.items.map((item) => (
            <InquiryCard
              key={item.id}
              item={item}
              disabled={updatingId === item.id}
              onStatusChange={updateStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}
