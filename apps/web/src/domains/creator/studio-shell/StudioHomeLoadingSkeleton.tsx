import { useEffect, useState } from "react";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 느린 네트워크·개발 서버에서만 보이는 안내. 짧은 로딩에서는 공간만 예약한다. */
export const STUDIO_HOME_SLOW_NOTICE_DELAY_MS = 5_000;
const QUICK_ACTION_PLACEHOLDERS = 5;
const RECENT_PLACEHOLDERS = 4;
const LIST_PLACEHOLDERS = 4;

function useDelayedFlag(delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return elapsed;
}

function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/**
 * 작품 홈 청크를 받는 동안 셸 안에서 최종 레이아웃과 같은 자리를 먼저 보여 준다.
 * 로컬 작품 목록은 청크가 도착하면 서버 응답 없이 즉시 그려진다.
 */
export function StudioHomeLoadingSkeleton({ variant = "home" }: { readonly variant?: "home" | "list" }) {
  const bt = useBilingual("StudioHomeLoadingSkeleton");
  const slow = useDelayedFlag(STUDIO_HOME_SLOW_NOTICE_DELAY_MS);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-route-pending="studio-home"
      data-studio-home-skeleton={variant}
      className="min-w-0"
    >
      <span className="sr-only">{bt("작품 홈을 여는 중입니다.", "Opening your studio home.")}</span>
      <Container size="wide" className="skeleton-group min-w-0 py-7 sm:py-11">
        {variant === "home" ? (
          <div className="grid gap-4" aria-hidden="true">
            <div className="overflow-hidden rounded-[0.875rem] border border-line bg-panel">
              <div className="grid gap-4 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <div className="grid content-center gap-3">
                  <div className="skeleton h-6 w-44 rounded-full" />
                  <div className="skeleton h-9 w-full max-w-md" />
                  <div className="skeleton h-9 w-3/4 max-w-sm" />
                  <div className="skeleton h-4 w-full max-w-lg opacity-80" />
                  <div className="skeleton h-12 w-full max-w-lg rounded-xl" />
                  <div className="flex flex-wrap gap-2">
                    <div className="skeleton h-11 w-32 rounded-xl" />
                    <div className="skeleton h-11 w-32 rounded-xl opacity-80" />
                  </div>
                </div>
                <div className="skeleton hidden min-h-56 rounded-xl md:block" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 border-t border-line p-3 sm:grid-cols-3 lg:grid-cols-5">
                {range(QUICK_ACTION_PLACEHOLDERS).map((index) => (
                  <div key={index} className="grid gap-2 rounded-[0.625rem] border border-line bg-card p-2">
                    <div className="skeleton aspect-[2/1] w-full rounded-md" />
                    <div className="skeleton h-3.5 w-2/3" />
                    <div className="skeleton h-3 w-1/2 opacity-80" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[0.75rem] border border-line bg-panel p-4">
              <div className="skeleton h-5 w-40" />
              <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {range(RECENT_PLACEHOLDERS).map((index) => (
                  <div key={index} className="skeleton aspect-[3/4] w-full rounded-[0.625rem]" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" aria-hidden="true">
            <div className="skeleton h-24 w-full rounded-xl" />
            {range(LIST_PLACEHOLDERS).map((index) => (
              <div key={index} className="skeleton h-16 w-full rounded-xl opacity-90" />
            ))}
          </div>
        )}
        {slow ? (
          <p className="mt-4 break-keep text-center text-xs font-semibold leading-5 text-fg-2">
            {bt(
              "작품 홈 화면을 준비하고 있어요. 이 기기에 저장된 작업은 그대로 보관되어 있습니다.",
              "Preparing your studio home. Work saved on this device is kept safely.",
            )}
          </p>
        ) : null}
      </Container>
    </div>
  );
}
