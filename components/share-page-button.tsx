import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// 전역 토스 공유 링크 브릿지 타입(__toonspectrumTossShareLink)은 share-button.tsx 의
// declare global 이 프로젝트 전역에 앰비언트로 제공한다(런타임 import 불필요).

/**
 * 화면(경로) 공유 버튼 — 작품 상세 외 공유 가치가 높은 화면(랭킹·놀이터 등)용 경량 공유.
 *
 * 우선순위: 토스 공식 공유 링크(`getTossShareLink` — 토스 셸이 전역으로 주입, 1200×600 OG 포함)
 * → OS 공유 시트(navigator.share) → 클립보드 복사(✓ 피드백). 웹·토스 공유(NO fork).
 */
export function SharePageButton({
  path,
  text,
  label = "공유",
  className,
}: {
  /** 공유할 앱 내 경로(예: "/ranking"). */
  path: string;
  /** 공유 문구(제목). */
  text: string;
  /** 버튼 라벨. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function onShare() {
    const webUrl =
      typeof window !== "undefined" ? `${globalThis.location.origin}${path}` : path;
    const tossUrl =
      typeof globalThis.__toonspectrumTossShareLink === "function"
        ? await globalThis.__toonspectrumTossShareLink(path)
        : null;
    const url = tossUrl || webUrl;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        /* 사용자 취소/미지원 — 클립보드 폴백 */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard 차단 환경 무시 */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/55 hover:bg-accent-soft/40 hover:text-fg",
        className,
      )}
    >
      {copied ? <Check size={14} className="text-good" /> : <Share2 size={14} className="text-accent" />}
      {copied ? "링크 복사됨" : label}
    </button>
  );
}
