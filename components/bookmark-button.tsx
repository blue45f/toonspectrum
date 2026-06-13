"use client";

import { Bookmark } from "lucide-react";

import { useApp, useHydrated } from "@/lib/store";
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
        setRead(titleId, active ? null : "want");
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
      <Bookmark size={size} className={active ? "fill-on-accent" : ""} strokeWidth={2} />
    </button>
  );
}
