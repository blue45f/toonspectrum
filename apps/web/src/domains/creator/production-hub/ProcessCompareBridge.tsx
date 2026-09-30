import { Columns2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { ProcessCompareViewer } from "./ProcessCompareViewer";
import {
  buildProcessCompareItems,
  canOpenProcessCompare,
  type ProcessCompareItem,
  type ProcessCompareKind,
} from "./process-compare-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

/**
 * ProductionManuscriptProcess → ProcessCompareItem 매핑에 필요한 최소 형태.
 * ProductionEpisodeProcessMatrix의 processes를 그대로 넘기면 된다.
 */
export interface ProcessCompareBridgeProcess {
  readonly id: string;
  readonly label: string;
  readonly kind: ProcessCompareKind;
  readonly revisions: readonly { readonly id: string; readonly createdAt: string }[];
}

function toBridgeProcess(process: ProductionManuscriptProcess): ProcessCompareBridgeProcess {
  return {
    id: process.artifact.id,
    label: process.label,
    kind: process.processType,
    revisions: process.revisions.map((revision) => ({ id: revision.id, createdAt: revision.createdAt })),
  };
}

export interface ProcessCompareLauncherProps {
  /** 비교할 공정 목록 (ProductionEpisodeProcessMatrix의 processes). */
  readonly processes: readonly ProductionManuscriptProcess[];
  /**
   * 리비전의 렌더 이미지 URL 해석기. 생략하면 플레이스홀더 아트를 사용한다.
   * blob 기반 실제 썸네일이 준비되면 이 콜백만 연결하면 된다.
   */
  readonly resolveImageUrl?: (processId: string, revisionId: string) => string | null;
  readonly className?: string;
}

/**
 * 공정 비교 모드 진입 브리지.
 *
 * 기존 ProductionEpisodeProcessMatrix 파일을 직접 수정하지 않고,
 * 부모가 매트릭스 옆(또는 툴바)에 이 컴포넌트를 마운트하면
 * "비교하기" 버튼 → 전체화면 비교 다이얼로그 동선이 연결된다.
 *
 * @example
 * ```tsx
 * <ProcessCompareLauncher processes={processes} resolveImageUrl={resolveThumb} />
 * ```
 */
export function ProcessCompareLauncher({ processes, resolveImageUrl, className }: ProcessCompareLauncherProps) {
  const bt = useBilingual("ProcessCompare");
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const items: readonly ProcessCompareItem[] = useMemo(
    () => buildProcessCompareItems(processes.map(toBridgeProcess), resolveImageUrl),
    [processes, resolveImageUrl],
  );
  const canOpen = canOpenProcessCompare(items);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Escape으로 닫기 + 포커스 관리
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open ]);

  // 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open ]);

  return (
    <>
      <button
        type="button"
        className={cn("pcv-tool-btn", className)}
        onClick={handleOpen}
        disabled={!canOpen}
        title={
          canOpen
            ? bt("공정별 결과물을 나란히 놓고 비교", "Compare process outputs side by side")
            : bt("비교할 결과물이 2개 이상 필요합니다", "Need at least 2 outputs to compare")
        }
        data-testid="pcv-launcher"
      >
        <Columns2 size={15} aria-hidden="true" />
        {bt("비교하기", "Compare")}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="pcv-dialog-backdrop" data-testid="pcv-dialog-backdrop">
              <div
                className="pcv-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={bt("공정 비교", "Process compare")}
              >
                <div className="pcv-dialog-head">
                  <Columns2 size={18} aria-hidden="true" />
                  <span className="pcv-dialog-title">{bt("공정 비교", "Process compare")}</span>
                  <button
                    ref={closeRef}
                    type="button"
                    className="pcv-tool-btn pcv-close"
                    onClick={handleClose}
                    aria-label={bt("비교 닫기", "Close compare")}
                    data-testid="pcv-dialog-close"
                  >
                    <X size={15} aria-hidden="true" />
                    {bt("닫기", "Close")}
                  </button>
                </div>
                <div className="pcv-dialog-body">
                  <ProcessCompareViewer items={items} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
