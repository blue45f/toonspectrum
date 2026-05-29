"use client";

import { ShieldAlert } from "lucide-react";
import { useApp, useHydrated } from "@/lib/store";

// 19금 표지 게이트 — 미인증 시 블러 + 성인 인증 버튼. 인증되면 사라짐.
// (자가 인증 방식의 옵션 기능. 실제 신원확인이 아닌 만 19세 이상 확인.)
export function AdultOverlay({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated();
  const verified = useApp((s) => s.adultVerified);
  const setVerified = useApp((s) => s.setAdultVerified);

  if (hydrated && verified) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-black/65 text-center backdrop-blur-xl"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ShieldAlert className="text-bad" size={compact ? 16 : 24} />
      {!compact && <span className="text-xs font-bold text-white/90">19세 이상</span>}
      {!compact ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setVerified(true);
          }}
          className="mt-0.5 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-[0.7rem] font-medium text-white transition-colors hover:bg-white/20"
        >
          성인 인증
        </button>
      ) : (
        <span className="text-[0.55rem] font-semibold text-white/80">19+</span>
      )}
    </div>
  );
}
