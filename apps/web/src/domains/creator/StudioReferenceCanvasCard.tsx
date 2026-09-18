import {
  ExternalLink,
  Images,
  Layers3,
  Move,
  Palette,
  Sparkles,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

export interface StudioReferenceCanvasCardProps {
  readonly itemCount?: number;
  readonly open?: boolean;
  readonly onOpenCanvas?: () => void;
  readonly onOpenWindow?: () => void;
  readonly className?: string;
}

const CAPABILITIES = [
  { label: "자유 배치", icon: Move },
  { label: "겹침 비교", icon: Layers3 },
  { label: "색상 추출", icon: Palette },
] as const;

/**
 * Compact entry point for ToonSpectrum's project-owned reference canvas.
 * The actual WYSIWYG surface and detached companion share the same document;
 * this card deliberately avoids keeping a second, disposable image viewer state.
 */
export function StudioReferenceCanvasCard({
  itemCount = 0,
  open = false,
  onOpenCanvas,
  onOpenWindow,
  className,
}: StudioReferenceCanvasCardProps) {
  const safeItemCount = Number.isFinite(itemCount)
    ? Math.max(0, Math.trunc(itemCount))
    : 0;
  const status = open
    ? "캔버스 열림"
    : safeItemCount > 0
      ? `${safeItemCount}개 연결`
      : "새 캔버스";

  return (
    <section
      aria-label="레퍼런스 캔버스"
      data-reference-canvas-entry="true"
      className={cn(
        "group relative isolate overflow-hidden rounded-2xl border border-line/80 bg-panel px-3 py-3 text-xs shadow-sm",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 size-36 rounded-full bg-accent/10 blur-3xl transition-transform duration-500 group-hover:scale-125"
      />

      <header className="relative flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
          <Images size={17} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <strong className="text-[0.78rem] text-fg">레퍼런스 캔버스</strong>
            <span
              aria-live="polite"
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[0.58rem] font-semibold tabular-nums",
                open
                  ? "border-good/35 bg-good/10 text-good"
                  : "border-line bg-raised text-fg-3",
              )}
            >
              {status}
            </span>
          </span>
          <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-fg-3">
            아이디어를 손으로 펼쳐 보는 자유 보드
          </span>
        </span>
        <Sparkles size={14} className="mt-1 shrink-0 text-accent/70" aria-hidden />
      </header>

      <div className="relative mt-3 h-28 overflow-hidden rounded-xl border border-line/70 bg-[oklch(0.14_0.008_70)]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,oklch(0.72_0.03_70/0.28)_1px,transparent_1px)] [background-size:14px_14px]"
        />
        <div
          aria-hidden
          className="absolute left-[8%] top-[18%] grid h-14 w-[37%] -rotate-6 place-items-center rounded-lg border border-line-strong bg-card/90 shadow-lg"
        >
          <span className="text-[0.55rem] font-semibold text-fg-3">구도</span>
        </div>
        <div
          aria-hidden
          className="absolute right-[7%] top-[11%] grid h-12 w-[30%] rotate-[7deg] place-items-center rounded-lg border border-line bg-[linear-gradient(135deg,oklch(0.72_0.14_42/0.45),oklch(0.57_0.16_295/0.35))] shadow-lg"
        >
          <span className="rounded bg-panel/75 px-1.5 py-0.5 text-[0.52rem] font-bold text-fg">색</span>
        </div>
        <div
          aria-hidden
          className="absolute bottom-[13%] left-[31%] grid h-16 w-[43%] place-items-center rounded-lg border border-accent bg-panel/95 shadow-[0_8px_24px_oklch(0.05_0.01_70/0.4)]"
        >
          <span className="text-[0.58rem] font-bold text-accent">포즈 · 분위기</span>
          <i className="absolute -left-1 -top-1 size-2 rounded-[2px] border border-accent bg-panel" />
          <i className="absolute -right-1 -top-1 size-2 rounded-[2px] border border-accent bg-panel" />
          <i className="absolute -bottom-1 -left-1 size-2 rounded-[2px] border border-accent bg-panel" />
          <i className="absolute -bottom-1 -right-1 size-2 rounded-[2px] border border-accent bg-panel" />
        </div>
        <span className="absolute bottom-1.5 right-2 rounded-full border border-line bg-panel/85 px-1.5 py-0.5 text-[0.52rem] font-medium text-fg-3 backdrop-blur-sm">
          드래그해서 바로 배치
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="레퍼런스 캔버스 기능">
        {CAPABILITIES.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-full border border-line/80 bg-card/70 px-2 py-1 text-[0.6rem] font-medium text-fg-2"
          >
            <Icon size={10} aria-hidden />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          aria-pressed={open}
          disabled={!onOpenCanvas}
          onClick={onOpenCanvas}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-accent/60 bg-accent px-3 text-[0.68rem] font-bold text-on-accent outline-none transition hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Images size={13} aria-hidden />
          {open ? "캔버스 보기" : "캔버스 열기"}
        </button>
        <button
          type="button"
          aria-label="레퍼런스 캔버스를 별도 창으로 열기"
          title="다른 모니터에서도 동기화되는 전용 창 열기"
          disabled={!onOpenWindow}
          onClick={onOpenWindow}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.68rem] font-semibold text-fg-2 outline-none transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ExternalLink size={13} aria-hidden />
          새 창
        </button>
      </div>

      <p className="mt-2 text-[0.59rem] leading-relaxed text-fg-3">
        캔버스에서 바꾼 이동·확대·회전·레이어 순서는 전용 창에도 바로 반영됩니다.
      </p>
    </section>
  );
}
