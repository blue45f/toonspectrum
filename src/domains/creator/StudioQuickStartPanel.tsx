import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  Maximize2,
  MessageCircle,
  MousePointer2,
  Palette,
  Pencil,
  Save,
  Shapes,
  Smile,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import {
  formatStudioShortcutChord,
  type StudioShortcutActionId,
} from "./studio-app-settings";

import { buttonClass } from "@/components/ui/button-utils";
import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

type StudioQuickStartShortcuts = Partial<Record<StudioShortcutActionId, string>>;

type StudioQuickStartCopy = {
  workflowTitle: string;
  workflowReady: string;
  workflowLabel: string;
  select: string;
  selectHint: (shortcut: string) => string;
  draw: string;
  drawHint: (shortcut: string) => string;
  dialogue: string;
  dialogueHint: (shortcut: string) => string;
  saveUndo: string;
  saveUndoHint: (undoShortcut: string) => string;
  moreTitle: string;
  moreHint: string;
  unassigned: string;
};

const STUDIO_QUICK_START_COPY = {
  ko: {
    workflowTitle: "처음 시작하는 4단계",
    workflowReady: "기능을 열면 바로 작업",
    workflowLabel: "선택, 그리기, 말풍선과 텍스트, 저장과 되돌리기",
    select: "선택",
    selectHint: (shortcut: string) => `${shortcut} · 클릭하거나 드래그해 고르기`,
    draw: "그리기",
    drawHint: (shortcut: string) => `${shortcut} · 펜을 열고 바로 그리기`,
    dialogue: "말풍선·텍스트",
    dialogueHint: (shortcut: string) => `${shortcut} · 도구를 열어 대사 넣기`,
    saveUndo: "저장·되돌리기",
    saveUndoHint: (undoShortcut: string) => `Ctrl/⌘S 저장 · ${undoShortcut} 되돌리기`,
    moreTitle: "다른 작업 바로 열기",
    moreHint: "도형·브러시·컷·캐릭터·3D",
    unassigned: "미지정",
  },
  en: {
    workflowTitle: "Start with these 4 steps",
    workflowReady: "Open a tool and start",
    workflowLabel: "Select, draw, add speech and text, then save or undo",
    select: "Select",
    selectHint: (shortcut: string) => `${shortcut} · Click or drag to select`,
    draw: "Draw",
    drawHint: (shortcut: string) => `${shortcut} · Open the pen and draw`,
    dialogue: "Speech · text",
    dialogueHint: (shortcut: string) => `${shortcut} · Open lettering and add dialogue`,
    saveUndo: "Save · undo",
    saveUndoHint: (undoShortcut: string) => `Ctrl/⌘S save · ${undoShortcut} undo`,
    moreTitle: "Open another tool",
    moreHint: "Shapes · brushes · panels · characters · 3D",
    unassigned: "Unassigned",
  },
} satisfies Record<"ko" | "en", StudioQuickStartCopy>;

function displayQuickStartShortcut(
  shortcuts: StudioQuickStartShortcuts,
  actionId: StudioShortcutActionId,
  defaultChord: string,
  unassignedLabel: string,
): string {
  const chord = shortcuts[actionId];
  if (typeof chord !== "string") return formatStudioShortcutChord(defaultChord);
  const trimmed = chord.trim();
  return trimmed ? formatStudioShortcutChord(trimmed) : unassignedLabel;
}

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
  shortcuts,
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
  onBrushKit: (trigger: HTMLButtonElement) => void;
  onCollabFocus: () => void;
  onOpenTutorials: () => void;
  shortcuts: StudioQuickStartShortcuts;
}) {
  const translate = useT();
  const language = useI18n((state) => state.lang);
  const korean = language.toLocaleLowerCase().startsWith("ko");
  const copy = korean ? STUDIO_QUICK_START_COPY.ko : STUDIO_QUICK_START_COPY.en;
  const t = (key: string) => (korean ? key : translate(key));
  const selectShortcut = displayQuickStartShortcut(shortcuts, "tool-select", "V", copy.unassigned);
  const drawShortcut = displayQuickStartShortcut(shortcuts, "tool-pen", "B", copy.unassigned);
  const dialogueShortcut = displayQuickStartShortcut(
    shortcuts,
    "tool-lettering",
    "T",
    copy.unassigned,
  );
  const undoShortcut = displayQuickStartShortcut(shortcuts, "undo", "Mod+Z", copy.unassigned);
  const quickTools: {
    id: "smart-shape" | "brush-kit" | "template" | "character" | "background-3d" | "collab-focus";
    label: string;
    hint: string;
    icon: typeof Pencil;
    onClick: (trigger: HTMLButtonElement) => void;
  }[] = [
    {
      id: "smart-shape",
      label: localizeText(t, "선·도형 다듬기", "studio.quickStart.step.smart-shape.label"),
      hint: localizeText(t, "그린 선을 반듯하게", "studio.quickStart.step.smart-shape.hint"),
      icon: Shapes,
      onClick: onSmartShape,
    },
    {
      id: "brush-kit",
      label: localizeText(t, "브러시 골라 그리기", "studio.quickStart.step.brush-kit.label"),
      hint: localizeText(t, "연필·마커·붓", "studio.quickStart.step.brush-kit.hint"),
      icon: Palette,
      onClick: onBrushKit,
    },
    {
      id: "template",
      label: localizeText(t, "컷 나누기", "studio.quickStart.step.template.label"),
      hint: localizeText(t, "웹툰 칸을 빠르게 배치", "studio.quickStart.step.template.hint"),
      icon: LayoutTemplate,
      onClick: onOpenTemplate,
    },
    {
      id: "character",
      label: localizeText(t, "캐릭터·포즈", "studio.quickStart.step.character.label"),
      hint: localizeText(t, "2D·3D 인물 배치", "studio.quickStart.step.character.hint"),
      icon: Smile,
      onClick: onOpenCharacter,
    },
    {
      id: "background-3d",
      label: localizeText(t, "3D 배경 열기", "studio.quickStart.step.background3d.label"),
      hint: localizeText(t, "장면과 소품 배치", "studio.quickStart.step.background3d.hint"),
      icon: Boxes,
      onClick: onOpenBackground3d,
    },
    {
      id: "collab-focus",
      label: localizeText(t, "캔버스 넓게 보기", "studio.quickStart.step.collab-focus.label"),
      hint: localizeText(t, "패널을 접고 집중", "studio.quickStart.step.collab-focus.hint"),
      icon: Maximize2,
      onClick: onCollabFocus,
    },
  ];

  return (
    <div
      data-studio-creative-starter="true"
      className="pointer-events-none absolute inset-x-2 top-16 z-[58] mx-auto max-w-[34rem] p-2 text-fg sm:top-4 sm:p-3"
    >
      <section
        role="dialog"
        aria-labelledby="studio-quick-start-title"
        aria-describedby="studio-quick-start-description"
        className="pointer-events-auto flex max-h-[min(60dvh,calc(100svh-5rem))] flex-col overflow-hidden rounded-lg border border-line bg-panel/95 shadow-xl backdrop-blur-md sm:max-h-[min(66dvh,calc(100svh-2rem))]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-3 py-2.5">
          <div className="min-w-0">
            <p
              id="studio-quick-start-title"
              className="text-sm font-bold tracking-tight text-fg"
            >
              {localizeText(t, "처음이라면 이 순서로 시작하세요", "studio.quickStart.title")}
            </p>
            <p
              id="studio-quick-start-description"
              className="mt-0.5 max-w-[48ch] text-[0.7rem] leading-snug text-fg-3"
            >
              {localizeText(
                t,
                "도구를 열면 바로 캔버스에서 작업해요. 설정은 나중에 바꿔도 됩니다.",
                "studio.quickStart.subtitle",
              )}
            </p>
          </div>
          <button
            type="button"
            data-studio-quickstart-dismiss="true"
            onClick={onDismiss}
            className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-lg border border-line text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            aria-label={localizeText(t, "빠른 시작 닫기", "studio.quickStart.dismiss")}
            title={localizeText(t, "빠른 시작 닫기", "studio.quickStart.dismiss")}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div
          data-studio-quickstart-scroll="true"
          className="min-h-0 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
            <h2 className="text-xs font-bold text-fg">
              {copy.workflowTitle}
            </h2>
            <span className="rounded-md bg-accent-soft px-2 py-1 text-[0.65rem] font-semibold text-accent ring-1 ring-accent/15">
              {copy.workflowReady}
            </span>
          </div>

          <ol
            data-studio-quickstart-workflow="true"
            aria-label={copy.workflowLabel}
            className="grid grid-cols-2 gap-1.5"
          >
            <li
              data-studio-quickstart-step="select"
              className="flex min-h-[4.5rem] items-start gap-2 rounded-lg border border-line bg-card p-2.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-fg-2">
                <MousePointer2 size={14} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-fg">1. {copy.select}</span>
                <span className="mt-1 block text-[0.66rem] leading-snug text-fg-3">
                  {copy.selectHint(selectShortcut)}
                </span>
              </span>
            </li>

            <li data-studio-quickstart-step="draw">
              <button
                type="button"
                onClick={onStartDraw}
                className="group flex min-h-[4.5rem] w-full touch-manipulation items-start gap-2 rounded-lg border border-accent/35 bg-accent-soft p-2.5 text-left transition-[border-color,background] duration-150 hover:border-accent/70 hover:bg-accent-soft/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-on-accent">
                  <Pencil size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-fg">2. {copy.draw}</span>
                  <span className="mt-1 block text-[0.66rem] leading-snug text-fg-2">
                    {copy.drawHint(drawShortcut)}
                  </span>
                </span>
                <ChevronRight className="mt-1 shrink-0 text-accent" size={14} aria-hidden />
              </button>
            </li>

            <li data-studio-quickstart-step="dialogue">
              <button
                type="button"
                onClick={onOpenBubble}
                className="group flex min-h-[4.5rem] w-full touch-manipulation items-start gap-2 rounded-lg border border-line bg-card p-2.5 text-left transition-[border-color,background] duration-150 hover:border-accent/55 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-fg-2 group-hover:text-accent">
                  <MessageCircle size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-fg">3. {copy.dialogue}</span>
                  <span className="mt-1 block text-[0.66rem] leading-snug text-fg-3">
                    {copy.dialogueHint(dialogueShortcut)}
                  </span>
                </span>
                <ChevronRight className="mt-1 shrink-0 text-fg-3 group-hover:text-accent" size={14} aria-hidden />
              </button>
            </li>

            <li
              data-studio-quickstart-step="save-undo"
              className="flex min-h-[4.5rem] items-start gap-2 rounded-lg border border-line bg-card p-2.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-fg-2">
                <Save size={14} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-xs font-bold text-fg">
                  4. {copy.saveUndo}
                  <Undo2 size={12} className="text-fg-3" aria-hidden />
                </span>
                <span className="mt-1 block text-[0.66rem] leading-snug text-fg-3">
                  {copy.saveUndoHint(undoShortcut)}
                </span>
              </span>
            </li>
          </ol>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={onQuickComic}
              className={cn(
                buttonClass({ size: "sm", variant: "solid" }),
                "col-span-2 min-h-11 touch-manipulation justify-center gap-1.5 px-3 text-xs sm:col-span-1",
              )}
            >
              <Sparkles size={15} aria-hidden />
              {localizeText(t, "웹툰 흐름으로 시작", "studio.quickStart.quickComic")}
            </button>
            <button
              type="button"
              onClick={onExample}
              className={cn(
                buttonClass({ size: "sm", variant: "quiet" }),
                "min-h-11 touch-manipulation justify-center gap-1.5 px-2 text-xs",
              )}
            >
              <LayoutTemplate size={15} aria-hidden />
              {localizeText(t, "예시로 익히기", "studio.quickStart.exampleCanvas")}
            </button>
            <button
              type="button"
              onClick={onOpenTutorials}
              className={cn(
                buttonClass({ size: "sm", variant: "outline" }),
                "min-h-11 touch-manipulation justify-center gap-1.5 px-2 text-xs",
              )}
            >
              <BookOpen size={15} aria-hidden />
              {localizeText(t, "전체 기능 안내", "studio.quickStart.tutorial")}
            </button>
          </div>

          <details
            data-studio-quickstart-more="true"
            className="group mt-2.5 border-t border-line pt-1.5"
          >
            <summary className="flex min-h-11 cursor-pointer touch-manipulation list-none items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
              <Shapes size={15} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-fg">
                  {copy.moreTitle}
                </span>
                <span className="mt-0.5 block truncate text-[0.65rem] text-fg-3">
                  {copy.moreHint}
                </span>
              </span>
              <ChevronDown
                size={15}
                className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>

            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
              {quickTools.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(event) => item.onClick(event.currentTarget)}
                    data-studio-quick-tool={item.id}
                    className="group flex min-h-12 touch-manipulation items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-left transition-[border-color,background] duration-150 hover:border-accent/55 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-fg-2 group-hover:text-accent">
                      <Icon size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.7rem] font-bold leading-tight text-fg">{item.label}</span>
                      <span className="mt-0.5 block truncate text-[0.62rem] text-fg-3">{item.hint}</span>
                    </span>
                    <ChevronRight size={13} className="shrink-0 text-fg-3 group-hover:text-accent" aria-hidden />
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
