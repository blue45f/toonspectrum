import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Palette,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { MarketplaceCommerceQuote } from "@toonspectrum/core/commerce";

import { getMarketplaceCommerceQuote } from "../commerce-api";
import { useMarketLibrary } from "../hooks/use-market-library";
import {
  resolveCurrentMarketAcquisitionRecord,
} from "../models/market-acquisition-target";
import type {
  ResolvedMarketAcquisitionRecord,
} from "../models/market-acquisition-target";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { MarketStudioHandoff } from "../models/market-studio-handoff";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";

interface MarketAcquisitionModalProps {
  open: boolean;
  onClose: () => void;
  record: CreatorMarketplaceResourceRecord;
  studioHandoff: MarketStudioHandoff;
  onAcquiredSuccess?: () => void;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError"
  );
}

export function MarketAcquisitionModal({
  open,
  onClose,
  record,
  studioHandoff,
  onAcquiredSuccess,
}: MarketAcquisitionModalProps) {
  const navigate = useNavigate();
  const { acquireResource } = useMarketLibrary();
  const acquisitionAbortRef = useRef<AbortController | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionNotice, setVersionNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<MarketplaceCommerceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [acquisition, setAcquisition] =
    useState<ResolvedMarketAcquisitionRecord | null>(null);

  useEffect(() => {
    acquisitionAbortRef.current?.abort();
    acquisitionAbortRef.current = null;
    setAgreed(false);
    setSubmitting(false);
    setCompleted(false);
    setError(null);
    setVersionNotice(null);
    setQuote(null);
    setQuoteLoading(false);
    setAcquisition(null);

    return () => {
      acquisitionAbortRef.current?.abort();
      acquisitionAbortRef.current = null;
    };
  }, [open, record.id]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const resourceId = acquisition?.record.id ?? record.id;
    setQuoteLoading(true);
    void getMarketplaceCommerceQuote(resourceId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setQuote(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuote(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [acquisition?.record.id, open, record.id]);

  if (!open) return null;

  const activeRecord = acquisition?.record ?? record;
  const kind = marketKindMeta(activeRecord.kind);
  const license = marketLicenseMeta(activeRecord.license);
  const redirectedToCurrentHead = acquisition?.redirectedToCurrentHead ?? false;
  const activeStudioActionLabel = redirectedToCurrentHead
    && studioHandoff.mode === "install-tool-pack"
      ? `Studio에서 v${activeRecord.resourceVersion} 설치·확인`
      : studioHandoff.actionLabel;

  const closeModal = () => {
    acquisitionAbortRef.current?.abort();
    acquisitionAbortRef.current = null;
    onClose();
  };

  const handleAcquire = async () => {
    if (!agreed || submitting) return;

    acquisitionAbortRef.current?.abort();
    const controller = new AbortController();
    acquisitionAbortRef.current = controller;
    setSubmitting(true);
    setError(null);

    try {
      const resolved = await resolveCurrentMarketAcquisitionRecord(activeRecord, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
      ) return;

      const retainedResolution = acquisition?.redirectedToCurrentHead
        ? {
            ...resolved,
            requestedReleaseId: acquisition.requestedReleaseId,
            redirectedToCurrentHead: true,
          }
        : resolved;

      if (resolved.redirectedToCurrentHead) {
        setAcquisition(retainedResolution);
        setAgreed(false);
        setVersionNotice(
          `현재 공개 버전 v${resolved.record.resourceVersion}으로 설치 대상이 변경되었습니다. 최신 라이선스와 출처 조건을 확인한 뒤 다시 동의해 주세요.`,
        );
        return;
      }

      const currentQuote = await getMarketplaceCommerceQuote(
        resolved.record.id,
        controller.signal,
      );
      setQuote(currentQuote);
      if (currentQuote.checkoutRequired) {
        if (!currentQuote.checkoutEnabled) {
          setError("현재 유료 운영 중이지만 결제 공급자 설정이 아직 준비되지 않았습니다.");
          return;
        }
        acquisitionAbortRef.current = null;
        onClose();
        navigate("/market/checkout/" + encodeURIComponent(resolved.record.id));
        return;
      }

      const acquired = await acquireResource(
        resolved.record,
        resolved.target.logicalPackId,
      );
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
      ) return;
      if (!acquired) {
        setError(
          "내 에셋에 추가하지 못했습니다. 아직 계정에 보관되지 않았습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      setAcquisition(retainedResolution);
      setVersionNotice(null);
      setCompleted(true);
      onAcquiredSuccess?.();
    } catch (caught) {
      if (
        controller.signal.aborted
        || acquisitionAbortRef.current !== controller
        || isAbortError(caught)
      ) return;
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "내 에셋에 추가하지 못했습니다. 현재 에셋은 계정에 보관되지 않았습니다.");
    } finally {
      if (acquisitionAbortRef.current === controller) {
        acquisitionAbortRef.current = null;
        setSubmitting(false);
      }
    }
  };

  const handleOpenInStudio = () => {
    closeModal();
    navigate(marketStudioResourceHref(activeRecord.id));
  };

  const handleGoToLibrary = () => {
    closeModal();
    navigate("/market/library");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-acquire-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="market-acquire-title" className="flex items-center gap-2 text-base font-bold text-fg">
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            <span>{completed ? translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "내 에셋에 추가 완료") : translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "내 에셋에 추가")}</span>
          </h2>
          <button
            type="button"
            onClick={closeModal}
            aria-label={translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "닫기")}
            className="rounded-lg p-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {completed ? (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-good/20 text-good">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">{translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "내 에셋에 안전하게 보관했습니다")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "계정 보관과 현재 기기 설치·적용은 서로 다른 단계입니다. ")}{studioHandoff.summary}
              </p>
            </div>

            {redirectedToCurrentHead ? (
              <div className="rounded-xl border border-accent/35 bg-accent/10 p-3 text-left text-xs leading-relaxed text-fg-2">
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "상세에서 본 v")}{record.resourceVersion}{translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "은 이전 릴리스입니다. 같은 제작자·패키지·종류임을 확인한 뒤 현재 공개 버전 v")}{activeRecord.resourceVersion}{translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "을 내 에셋에 추가했습니다.")}</div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-line bg-panel p-3.5 text-left text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-fg">
                <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                <span>{license.label}</span>
              </p>
              <p className="text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
              {activeRecord.attributionText ? (
                <p className="text-[0.68rem] leading-relaxed text-fg-3">
                  {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "출처 표기: ")}{activeRecord.attributionText}
                </p>
              ) : null}
              <p className="border-t border-line pt-2 text-[0.68rem] leading-relaxed text-fg-3">
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "설치 대상: v")}{activeRecord.resourceVersion} {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "· 무결성 ")}{activeRecord.manifestHash.slice(0, 12)}…
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleOpenInStudio}
                className={buttonClass({ variant: "solid", size: "md", className: "w-full gap-2" })}
              >
                <Palette className="size-4" aria-hidden="true" />
                <span>{activeStudioActionLabel}</span>
              </button>
              <button
                type="button"
                onClick={handleGoToLibrary}
                className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
              >
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "내 에셋 관리로 이동")}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-raised font-bold text-accent">
                <kind.icon className="size-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded bg-accent/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-accent">
                  {kind.label}
                </span>
                <h3 className="truncate text-sm font-bold leading-snug text-fg">{activeRecord.name}</h3>
                <p className="text-[0.68rem] text-fg-3">
                  {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "제작자: ")}{activeRecord.publisher.name} {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "· 설치 대상 v")}{activeRecord.resourceVersion}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl border border-line bg-panel/60 p-3 text-[0.7rem] leading-relaxed text-fg-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[0.62rem] font-bold text-on-accent">1</span>
              <span>{translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "서버에서 같은 패키지의 현재 공개 릴리스와 제작자·종류·안정 식별자를 확인합니다.")}</span>
              <span className="flex size-5 items-center justify-center rounded-full bg-raised text-[0.62rem] font-bold text-fg">2</span>
              <span>{translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "현재 릴리스를 내 계정에 보관한 뒤, Studio에서 그 정확한 버전을 설치합니다.")}</span>
            </div>

            <div className="space-y-2 rounded-xl border border-good/40 bg-good/10 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-fg">이용 비용</span>
                <span className="text-sm font-extrabold text-good">
                  {quoteLoading
                    ? "확인 중…"
                    : quote?.checkoutRequired
                      ? new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(quote.amount)
                      : "무료"}
                </span>
              </div>
              <p className="text-[0.68rem] leading-relaxed text-fg-3">
                {quote?.policyNotice ?? "운영 정책과 사용권 조건을 함께 확인해 주세요. 상업 이용·수정·출처 표기 범위는 리소스별 라이선스를 따릅니다."}
              </p>
              <div className="border-t border-good/20 pt-2 text-xs text-fg-2">
                <p className="flex items-center gap-1.5 font-semibold text-good">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  <span>{license.label}</span>
                </p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
                {activeRecord.attributionText ? (
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "출처 표기: ")}{activeRecord.attributionText}
                  </p>
                ) : null}
              </div>
            </div>

            {versionNotice ? (
              <div role="status" className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs leading-relaxed text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{versionNotice}</span>
              </div>
            ) : null}

            <label className="flex cursor-pointer select-none items-start gap-2 rounded-xl border border-line/70 bg-panel/45 p-3 text-xs text-fg-2 transition-colors hover:border-line-strong">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-[0.72rem] leading-relaxed">
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "표시된 라이선스와 출처 조건을 확인했습니다. 이 에셋을 내 계정에 보관하고 필요할 때 기기에 설치하겠습니다.")}</span>
            </label>

            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs leading-relaxed text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={closeModal}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                {translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "취소")}</button>
              <button
                type="button"
                onClick={() => void handleAcquire()}
                disabled={
                  !agreed
                  || submitting
                  || quoteLoading
                  || Boolean(quote?.checkoutRequired && !quote.checkoutEnabled)
                }
                aria-busy={submitting || undefined}
                title={!agreed ? translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "라이선스와 출처 조건을 확인하면 추가할 수 있습니다.") : undefined}
                className={buttonClass({
                  variant: "solid",
                  size: "md",
                  className: "min-w-36 gap-2 disabled:opacity-40",
                })}
              >
                <Download className="size-4" aria-hidden="true" />
                <span>{submitting
                  ? translateCurrentStaticSourceText("domains.market.components.MarketAcquisitionModal", "ko", "현재 버전 확인 중…")
                  : versionNotice
                    ? `현재 v${activeRecord.resourceVersion} 조건 확인 후 추가`
                    : quote?.checkoutRequired
                      ? "결제하고 내 에셋에 추가"
                      : "내 에셋에 추가"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
