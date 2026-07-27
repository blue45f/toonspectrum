import {
  BookOpen,
  Boxes,
  LayoutTemplate,
  Maximize2,
  MessageCircle,
  Palette,
  Pencil,
  Shapes,
  Smile,
  Sparkles,
  X,
} from "lucide-react";
import { Suspense } from "react";

import { buttonClass } from "@/components/ui/button-utils";
import { useT } from "@/lib/i18n";
import { lazyRetry } from "@/lib/lazy-retry";
import { cn } from "@/lib/utils";

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

const StudioStarterCardArt = lazyRetry(
  () =>
    import("./studio-creative-visuals").then((module) => ({
      default: module.StudioStarterCardArt,
    })),
  "StudioStarterCardArt"
);

export function StudioQuickStartPanel({
  onDismiss,
  onQuickComic,
  onExample,
  onOpenTemplate,
  onOpenCharacter,
  onOpenBackground3d,
  onOpenBubble,
  onSmartShape,
  onStartDraw,
  onBrushKit,
  onCollabFocus,
  onOpenTutorials,
}: {
  onDismiss: () => void;
  onQuickComic: () => void;
  onExample: () => void;
  onOpenTemplate: () => void;
  onOpenCharacter: () => void;
  onOpenBackground3d: () => void;
  onOpenBubble: () => void;
  onSmartShape: () => void;
  onStartDraw: () => void;
  onBrushKit: () => void;
  onCollabFocus: () => void;
  onOpenTutorials: () => void;
}) {
  const t = useT();
  // Drawing-first tools only — Canva-style visual starter cards (no marketing copy).
  const steps: {
    id: "draw" | "smart-shape" | "brush-kit" | "template" | "collab-focus" | "character" | "background-3d" | "bubble";
    label: string;
    hint: string;
    icon: typeof Pencil;
    onClick: () => void;
  }[] = [
    {
      id: "draw",
      label: localizeText(t, "펜으로 그리기", "studio.quickStart.step.draw.label"),
      hint: localizeText(t, "바로 스케치 시작", "studio.quickStart.step.draw.hint"),
      icon: Pencil,
      onClick: onStartDraw,
    },
    {
      id: "smart-shape",
      label: localizeText(t, "스마트 도형", "studio.quickStart.step.smart-shape.label"),
      hint: localizeText(t, "낙서 → 선·원·사각형", "studio.quickStart.step.smart-shape.hint"),
      icon: Shapes,
      onClick: onSmartShape,
    },
    {
      id: "brush-kit",
      label: localizeText(t, "브러시", "studio.quickStart.step.brush-kit.label"),
      hint: localizeText(t, "연필·마커·붓·형광펜", "studio.quickStart.step.brush-kit.hint"),
      icon: Palette,
      onClick: onBrushKit,
    },
    {
      id: "template",
      label: localizeText(t, "컷 템플릿", "studio.quickStart.step.template.label"),
      hint: localizeText(t, "패널 레이아웃 배치", "studio.quickStart.step.template.hint"),
      icon: LayoutTemplate,
      onClick: onOpenTemplate,
    },
    {
      id: "collab-focus",
      label: localizeText(t, "캔버스 넓히기", "studio.quickStart.step.collab-focus.label"),
      hint: localizeText(t, "패널 접고 집중 모드", "studio.quickStart.step.collab-focus.hint"),
      icon: Maximize2,
      onClick: onCollabFocus,
    },
    {
      id: "character",
      label: localizeText(t, "캐릭터", "studio.quickStart.step.character.label"),
      hint: localizeText(t, "2D / 3D 포즈", "studio.quickStart.step.character.hint"),
      icon: Smile,
      onClick: onOpenCharacter,
    },
    {
      id: "background-3d",
      label: localizeText(t, "3D 배경", "studio.quickStart.step.background3d.label"),
      hint: localizeText(t, "장면 배치 · 물리 낙하", "studio.quickStart.step.background3d.hint"),
      icon: Boxes,
      onClick: onOpenBackground3d,
    },
    {
      id: "bubble",
      label: localizeText(t, "말풍선", "studio.quickStart.step.bubble.label"),
      hint: localizeText(t, "대사 넣기", "studio.quickStart.step.bubble.hint"),
      icon: MessageCircle,
      onClick: onOpenBubble,
    },
  ];

  return (
    <div
      data-studio-creative-starter="true"
      className="pointer-events-none absolute inset-x-2 top-16 z-[44] mx-auto max-h-[min(68vh,calc(100%-1rem))] max-w-xl p-3 text-fg sm:top-4 sm:z-50 sm:max-h-[calc(100%-1rem)] sm:p-3.5"
    >
      <div
        className="pointer-events-auto relative rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-md sm:p-3.5"
      >
        <div className="pointer-events-none flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold tracking-tight">{localizeText(t, "도구 빠른 실행", "studio.quickStart.title")}</p>
            <p className="mt-0.5 max-w-[40ch] text-[0.7rem] leading-snug text-fg-3">
              {localizeText(t, "4단계로 한 페이지를 조립하거나 아래에서 바로 도구를 고르세요.", "studio.quickStart.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={localizeText(t, "닫기", "studio.quickStart.dismiss")}
            title={localizeText(t, "닫기", "studio.quickStart.dismiss")}
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onQuickComic}
            className={cn(
              "pointer-events-auto",
              buttonClass({ size: "sm", variant: "solid" }),
              "min-h-11 justify-center gap-1.5 px-3 text-sm"
            )}
          >
            <Sparkles size={15} aria-hidden />
            {localizeText(t, "빠른 웹툰 만들기", "studio.quickStart.quickComic")}
          </button>
          <button
            type="button"
            onClick={onExample}
            className={cn(
              "pointer-events-auto",
              buttonClass({ size: "sm", variant: "quiet" }),
              "min-h-11 justify-center gap-1.5 px-3 text-sm"
            )}
          >
            <LayoutTemplate size={15} aria-hidden />
            {localizeText(t, "예시 캔버스", "studio.quickStart.exampleCanvas")}
          </button>
          <button
            type="button"
            onClick={onStartDraw}
            className={cn(
              "pointer-events-auto",
              buttonClass({ size: "sm", variant: "quiet" }),
              "min-h-11 justify-center gap-1.5 px-3 text-sm"
            )}
          >
            <Pencil size={15} aria-hidden />
            {localizeText(t, "빈 캔버스에서 그리기", "studio.quickStart.drawCanvas")}
          </button>
          <button
            type="button"
            onClick={onOpenTutorials}
            className={cn(
              "pointer-events-auto",
              buttonClass({ size: "sm", variant: "outline" }),
              "min-h-11 justify-center gap-1.5 px-3 text-sm"
            )}
          >
            <BookOpen size={15} aria-hidden />
            {localizeText(t, "기능 튜토리얼", "studio.quickStart.tutorial")}
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                type="button"
                onClick={step.onClick}
                data-studio-starter-card={step.id}
                className="pointer-events-auto group flex min-h-[5.5rem] flex-col items-stretch gap-1.5 rounded-xl border border-line bg-card p-1.5 text-left shadow-sm transition-[border-color,background,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-accent/55 hover:bg-raised hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Suspense fallback={<div className="h-11 w-full rounded-lg bg-raised/60" aria-hidden />}>
                  <StudioStarterCardArt id={step.id} />
                </Suspense>
                <span className="flex min-w-0 items-start gap-1.5 px-1 pb-0.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent ring-1 ring-accent/15">
                    <Icon size={13} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold tracking-tight text-fg">{step.label}</span>
                    <span className="mt-0.5 block text-[0.62rem] leading-snug text-fg-3">{step.hint}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-2xl border border-line/5" aria-hidden="true" />
      </div>
    </div>
  );
}
