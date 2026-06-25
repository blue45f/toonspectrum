// 놀이터 게임 공용 "게임 방법" 안내 — 첫 진입 시 규칙 오버레이를 띄우고,
// 작은 "방법" 칩 버튼으로 언제든 다시 열 수 있게 한다. 게임별로 title+steps만 주입.

import { HelpCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HelpStep {
  /** 앞에 붙는 이모지(예: "🎯"). */
  emoji: string;
  /** 단계 제목(예: "목표"). */
  title: string;
  /** 설명(강조는 <b>/<span> 등 ReactNode 허용). */
  desc: ReactNode;
}

/**
 * 자체적으로 "방법" 버튼 + 규칙 오버레이를 렌더한다(여는 상태 직접 관리).
 * 게임 헤더 어딘가에 `<GameHelp title=... steps=... />` 한 줄만 두면 됨.
 */
export function GameHelp({
  title,
  steps,
  className,
  defaultOpen = true,
}: {
  title: string;
  steps: HelpStep[];
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Esc로 닫기(표준 모달 a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-medium text-fg-2 transition hover:border-accent/60 hover:text-accent",
          className,
        )}
        aria-label="게임 방법 보기"
      >
        <HelpCircle className="h-3.5 w-3.5" /> 방법
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          {/* 백드롭(클릭/Enter/Space로 닫힘 — 실제 button이라 a11y 충족) */}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${title} 게임 방법`}
            className="relative w-full max-w-sm rounded-2xl border border-line bg-card p-5 shadow-2xl"
          >
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-fg">
              <HelpCircle className="h-5 w-5 text-accent" /> {title} — 이렇게 해요
            </h3>
            <ul className="space-y-2.5 text-[0.82rem] leading-relaxed text-fg-2">
              {steps.map((s) => (
                <li key={s.title}>
                  <b className="text-fg">
                    {s.emoji} {s.title}
                  </b>{" "}
                  — {s.desc}
                </li>
              ))}
            </ul>
            <Button variant="solid" className="mt-4 w-full" onClick={() => setOpen(false)}>
              알겠어요, 시작!
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default GameHelp;
