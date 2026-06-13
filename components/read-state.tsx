"use client";

import { Bookmark, BookOpen, CheckCircle2, XCircle } from "lucide-react";

import type { ReadState } from "@/lib/types";

import { useApp, useHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";


const OPTS: { state: ReadState; label: string; icon: typeof Bookmark }[] = [
  { state: "want", label: "관심", icon: Bookmark },
  { state: "reading", label: "보는 중", icon: BookOpen },
  { state: "done", label: "완독", icon: CheckCircle2 },
  { state: "dropped", label: "하차", icon: XCircle },
];

export function ReadStateSelector({ titleId, className }: { titleId: string; className?: string }) {
  const hydrated = useHydrated();
  const current = useApp((s) => s.reads[titleId]);
  const setRead = useApp((s) => s.setRead);

  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      {OPTS.map((o) => {
        const active = hydrated && current === o.state;
        return (
          <button
            key={o.state}
            onClick={() => setRead(titleId, active ? null : o.state)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors duration-150",
              active
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:border-line-strong hover:text-fg-2"
            )}
          >
            <o.icon size={17} className={active ? "fill-accent/20" : ""} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
