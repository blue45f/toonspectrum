/**
 * Studio 3D 포즈/손 패널 첫 진입 가이드 카드.
 *
 * 처음 보는 사용자가 "이 기능이 뭔지" 10초 안에 파악하도록 3줄 요약을 보여주고,
 * "다시 보지 않기"를 체크하면 localStorage에 기록해 다음부터는 숨긴다.
 * 인앱 WebView·시크릿 모드에서도 깨지지 않게 저장소 접근은 전부 try/catch 다.
 *
 * - 다크/라이트: 기존 패널 토큰(border-line, bg-card, text-fg-*)만 사용.
 * - 모바일 390px: 작은 텍스트·유연한 레이아웃.
 * - reduced-motion: 애니메이션 없음.
 */

import { X, type LucideIcon } from "lucide-react";
import { useState, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioPoseGuideStep {
  /** 한글 한 줄 설명. */
  readonly ko: string;
  /** 영어 한 줄 설명(선택). 있으면 작게 함께 표시한다. */
  readonly en?: string;
}

export interface StudioPoseFirstRunGuideProps {
  /** localStorage 네임스페이스. 패널마다 다르게 준다. */
  readonly scope: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly steps: readonly StudioPoseGuideStep[];
  readonly className?: string;
}

function guideStorageKey(scope: string): string {
  return `toonstudio.pose-first-run-guide.dismissed.${scope}.v1`;
}

/** 이 scope의 가이드를 사용자가 닫았는지(다시 보지 않기) 읽는다. */
export function readStudioPoseGuideDismissed(scope: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(guideStorageKey(scope)) === "1";
  } catch {
    return false;
  }
}

function writeStudioPoseGuideDismissed(scope: string, dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      window.localStorage.setItem(guideStorageKey(scope), "1");
    } else {
      window.localStorage.removeItem(guideStorageKey(scope));
    }
  } catch {
    // 저장 실패는 무시하고 이번 세션 상태만 유지한다.
  }
}

export function StudioPoseFirstRunGuide({
  scope,
  icon: Icon,
  title,
  steps,
  className,
}: StudioPoseFirstRunGuideProps): ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(() => readStudioPoseGuideDismissed(scope));
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  if (dismissed) return null;

  const handleClose = () => {
    if (doNotShowAgain) writeStudioPoseGuideDismissed(scope, true);
    setDismissed(true);
  };

  return (
    <div
      role="note"
      aria-label={`${title} 안내`}
      className={cn(
        "relative rounded-xl border border-accent/35 bg-accent-soft/25 p-3",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="가이드 닫기"
        title="가이드 닫기"
        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-fg-3 transition-colors hover:bg-raised hover:text-fg"
      >
        <X size={13} aria-hidden />
      </button>
      <p className="flex items-center gap-1.5 pr-6 text-[0.72rem] font-bold text-fg">
        <Icon size={14} className="shrink-0 text-accent" aria-hidden />
        {title}
      </p>
      <ol className="mt-1.5 space-y-1">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-1.5 text-[0.68rem] leading-relaxed text-fg-2">
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-full bg-accent/15 text-[0.6rem] font-bold text-accent"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block">{step.ko}</span>
              {step.en ? (
                <span className="block text-[0.62rem] text-fg-3">{step.en}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[0.66rem] text-fg-3">
        <input
          type="checkbox"
          checked={doNotShowAgain}
          onChange={(event) => setDoNotShowAgain(event.target.checked)}
          className="size-3.5"
        />
        다시 보지 않기
        <span className="text-fg-3/70">(Don&apos;t show again)</span>
      </label>
    </div>
  );
}
