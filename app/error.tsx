"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { spectrumGradient } from "@/lib/genre-color";
import { RotateCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 실제 서비스라면 여기서 에러 리포팅
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-8 h-1 w-40 rounded-full"
        style={{ background: spectrumGradient(["스릴러", "공포", "액션"]) }}
      />
      <p className="eyebrow text-fg-3">SOMETHING BROKE</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">잠시 길을 잃었어요</h1>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-3">
        예상치 못한 오류가 발생했습니다. 다시 시도하거나 홈으로 돌아가 주세요.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button onClick={reset} className={buttonClass()}>
          <RotateCw size={16} /> 다시 시도
        </button>
        <Link href="/" className={buttonClass({ variant: "outline" })}>
          <Home size={16} /> 홈으로
        </Link>
      </div>
    </div>
  );
}
