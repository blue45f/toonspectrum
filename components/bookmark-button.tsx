import { Bookmark } from "lucide-react";
import { useState } from "react";

import { useCelebrate } from "./use-celebrate";

import { useApp, useHydrated } from "@/lib/store";
import { toast } from "@/lib/toast-store";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  titleId,
  className,
  size = 16,
}: {
  titleId: string;
  className?: string;
  size?: number;
}) {
  const hydrated = useHydrated();
  const state = useApp((s) => s.reads[titleId]);
  const setRead = useApp((s) => s.setRead);
  const celebrate = useCelebrate();
  // 담기 성공 1회성 플립 — 키를 올려 재트리거(연타 시에도 매번 새 애니메이션).
  const [flipKey, setFlipKey] = useState(0);
  // '관심(want)'만 북마크로 간주 — 하차/완독/보는 중 상태를 토글로 덮어쓰지 않도록
  const active = hydrated && state === "want";

  return (
    <button
      type="button"
      aria-label={active ? "관심 해제" : "관심 등록"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = active ? null : "want";
        setRead(titleId, next);
        if (next) {
          // 담기 성공 축하 — 아이콘 3D 플립 + 파티클 + pop + 햅틱. 해제는 조용히.
          setFlipKey((k) => k + 1);
          celebrate(e.currentTarget, { chars: ["📚", "✨", "💖"], count: 12, spread: 0.8, sfx: "pop" });
        }
        toast(next ? "관심 작품에 담았어요" : "관심을 해제했어요", {
          tone: next ? "success" : "default",
        });
      }}
      className={cn(
        "grid place-items-center rounded-lg border backdrop-blur-md transition-all duration-150 ease-out-expo active:scale-90",
        active
          ? "border-accent/40 bg-accent text-on-accent"
          : "border-[oklch(0.95_0.01_85/0.22)] bg-[oklch(0.16_0.01_70/0.58)] text-[oklch(0.95_0.01_85/0.86)] hover:bg-[oklch(0.22_0.012_68/0.72)] hover:text-fg",
        className
      )}
      style={{ width: size + 16, height: size + 16 }}
    >
      {/* key 로 담기마다 pf-flip-pop 을 재생(1회성 3D 플립). 해제·초기 렌더엔 애니메이션 없음. */}
      <Bookmark
        key={flipKey}
        size={size}
        className={cn(active && "fill-on-accent", flipKey > 0 && active && "pf-flip-pop")}
        strokeWidth={2}
      />
    </button>
  );
}
