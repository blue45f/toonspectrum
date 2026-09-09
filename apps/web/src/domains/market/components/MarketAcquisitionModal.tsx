import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Palette,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMarketLibrary } from "../hooks/use-market-library";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";

interface MarketAcquisitionModalProps {
  open: boolean;
  onClose: () => void;
  record: CreatorMarketplaceResourceRecord;
  onAcquiredSuccess?: () => void;
}

export function MarketAcquisitionModal({
  open,
  onClose,
  record,
  onAcquiredSuccess,
}: MarketAcquisitionModalProps) {
  const navigate = useNavigate();
  const { acquireResource } = useMarketLibrary();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);

  const handleAcquire = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const acquired = await acquireResource(record);
      if (!acquired) {
        setError(
          "내 에셋에 추가하지 못했습니다. 아직 계정에 보관되지 않았습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }
      setCompleted(true);
      onAcquiredSuccess?.();
    } catch (caught) {
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "내 에셋에 추가하지 못했습니다. 현재 에셋은 계정에 보관되지 않았습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenInStudio = () => {
    onClose();
    navigate(`/studio?installMarketResource=${record.id}&assetMarket=community`);
  };

  const handleGoToLibrary = () => {
    onClose();
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
            <span>{completed ? "내 에셋에 추가 완료" : "내 에셋에 추가"}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
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
              <h3 className="text-lg font-bold text-fg">내 에셋에 안전하게 보관했습니다</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                계정 보관과 현재 기기 설치는 서로 다른 단계입니다. 지금 Studio에서 열면 이 기기에 설치하고 바로 시험할 수 있습니다.
              </p>
            </div>

            <div className="space-y-1 rounded-xl border border-line bg-panel p-3.5 text-left text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-fg">
                <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                <span>{license.label}</span>
              </p>
              <p className="text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
              {record.attributionText ? (
                <p className="text-[0.68rem] leading-relaxed text-fg-3">
                  출처 표기: {record.attributionText}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleOpenInStudio}
                className={buttonClass({ variant: "solid", size: "md", className: "w-full gap-2" })}
              >
                <Palette className="size-4" aria-hidden="true" />
                <span>Studio에서 설치하고 시험하기</span>
              </button>
              <button
                type="button"
                onClick={handleGoToLibrary}
                className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
              >
                내 에셋 관리로 이동
              </button>
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
                <h3 className="truncate text-sm font-bold leading-snug text-fg">{record.name}</h3>
                <p className="text-[0.68rem] text-fg-3">
                  제작자: {record.publisher.name} · v{record.resourceVersion}
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-good/40 bg-good/10 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-fg">이용 비용</span>
                <span className="text-sm font-extrabold text-good">무료</span>
              </div>
              <p className="text-[0.68rem] leading-relaxed text-fg-3">
                비용은 없지만 사용권 조건은 적용됩니다. 상업 이용·수정·출처 표기 범위를 아래에서 확인하세요.
              </p>
              <div className="border-t border-good/20 pt-2 text-xs text-fg-2">
                <p className="flex items-center gap-1.5 font-semibold text-good">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  <span>{license.label}</span>
                </p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>
                {record.attributionText ? (
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                    출처 표기: {record.attributionText}
                  </p>
                ) : null}
              </div>
            </div>

            <label className="flex cursor-pointer select-none items-start gap-2 rounded-xl border border-line/70 bg-panel/45 p-3 text-xs text-fg-2 transition-colors hover:border-line-strong">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-[0.72rem] leading-relaxed">
                표시된 라이선스와 출처 조건을 확인했습니다. 이 에셋을 내 계정에 보관하고 필요할 때 기기에 설치하겠습니다.
              </span>
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
                onClick={onClose}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleAcquire()}
                disabled={!agreed || submitting}
                aria-busy={submitting || undefined}
                title={!agreed ? "라이선스와 출처 조건을 확인하면 추가할 수 있습니다." : undefined}
                className={buttonClass({
                  variant: "solid",
                  size: "md",
                  className: "min-w-36 gap-2 disabled:opacity-40",
                })}
              >
                <Download className="size-4" aria-hidden="true" />
                <span>{submitting ? "내 에셋에 추가 중…" : "내 에셋에 추가"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
