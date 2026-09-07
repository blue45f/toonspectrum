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
          "계정 라이브러리에 추가하지 못했습니다. 에셋은 소장 처리되지 않았으며 네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }
      setCompleted(true);
      onAcquiredSuccess?.();
    } catch (caught) {
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "계정 라이브러리에 추가하지 못했습니다. 에셋은 소장 처리되지 않았습니다.");
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
            <span>{completed ? "계정 라이브러리 추가 완료" : "무료 에셋 소장"}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-fg-3 hover:bg-raised hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">닫기</span>
          </button>
        </div>

        {completed ? (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-good/20 text-good">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">계정 라이브러리에 추가되었습니다</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                서버가 소장 상태를 확인했습니다. Studio 설치는 별도 단계이며 현재 기기에서 직접 진행됩니다.
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
                <span>Studio에서 열기</span>
              </button>
              <button
                type="button"
                onClick={handleGoToLibrary}
                className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
              >
                내 에셋으로 이동
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
                <span className="text-xs font-semibold text-fg">결제 금액</span>
                <span className="text-sm font-extrabold text-good">0원</span>
              </div>
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

            <label className="flex cursor-pointer select-none items-start gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-[0.72rem] leading-relaxed">
                표시된 라이선스와 출처 조건을 확인했으며 이 에셋을 계정 라이브러리에 추가합니다.
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
                className={buttonClass({
                  variant: "solid",
                  size: "md",
                  className: "min-w-36 gap-2 disabled:opacity-40",
                })}
              >
                <Download className="size-4" aria-hidden="true" />
                <span>{submitting ? "계정에 추가 중" : "무료로 소장하기"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
