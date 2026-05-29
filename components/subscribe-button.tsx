"use client";

import { Bell, BellRing } from "lucide-react";
import { useApp, useHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";

// 연재 알림 구독 토글 — 진행 중 작품 상세에서 사용
export function SubscribeButton({
  titleId,
  days,
  className,
}: {
  titleId: string;
  days?: string[];
  className?: string;
}) {
  const hydrated = useHydrated();
  const subscribed = useApp((s) => s.subscriptions[titleId]);
  const toggle = useApp((s) => s.toggleSubscription);
  const on = hydrated && subscribed;

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(titleId)}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors duration-150",
        on
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
        className
      )}
    >
      {on ? <BellRing size={16} /> : <Bell size={16} />}
      {on ? `연재 알림 켜짐${days?.length ? ` · ${days.join("·")}` : ""}` : "연재 알림 받기"}
    </button>
  );
}
