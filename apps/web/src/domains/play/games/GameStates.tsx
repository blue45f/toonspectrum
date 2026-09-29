// 아케이드 게임 공용 상태 화면 — 로딩 스켈레톤과 에러/재시도.
// 디자인 토큰(globals.css @theme)만 사용하고 하드코딩 색상은 쓰지 않는다.

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-shimmer rounded-lg bg-line/40", className)}
    />
  );
}

/**
 * 게임 로딩 스켈레톤 — 실제 게임 레이아웃(힌트 카드 + 보기 버튼)을 닮은 shimmer 골격.
 * `label`은 스크린리더용 sr-only 상태 텍스트.
 */
export function PlayGameSkeleton({ label, layout = "quiz" }: { label: string; layout?: "quiz" | "duel" | "board" | "roulette" }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="flex items-center justify-between">
        <Shimmer className="h-5 w-28" />
        <Shimmer className="h-5 w-20" />
      </div>
      {layout === "duel" && (
        <div className="flex gap-2.5">
          <Shimmer className="aspect-[3/4] flex-1" />
          <Shimmer className="aspect-[3/4] flex-1" />
        </div>
      )}
      {layout === "board" && (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }, (_, i) => (
            <Shimmer key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      )}
      {layout === "roulette" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line p-4">
          <Shimmer className="aspect-[3/4] w-40" />
          <Shimmer className="h-5 w-36" />
          <Shimmer className="h-9 w-32" />
        </div>
      )}
      {layout === "quiz" && (
        <>
          <div className="flex flex-col items-center gap-2">
            <Shimmer className="aspect-[3/4] w-40" />
            <Shimmer className="h-4 w-52" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Shimmer key={i} className="h-11 w-full" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 게임 데이터 로드 실패 — 스냅샷 fetch 실패 시 재시도 버튼을 제공한다.
 */
export function PlayGameError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center" role="alert">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warn">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-fg">데이터를 불러오지 못했어요.</p>
        <p className="mt-1 max-w-xs text-xs text-fg-3">
          인터넷 연결을 확인한 뒤 다시 시도해 주세요.
          <span className="sr-only"> 오류: {message}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="solid" size="sm" onClick={onRetry}>
          <RotateCcw className="mr-1 h-4 w-4" /> 다시 불러오기
        </Button>
      </div>
    </div>
  );
}
