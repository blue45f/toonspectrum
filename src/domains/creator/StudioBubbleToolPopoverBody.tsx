import { MessageCircle } from "lucide-react";

import { groupBubbleVariants } from "./studio-assets";
import { writeStudioInsertDragPayload } from "./studio-insert-drag-writer";
import { StudioBubbleVariantGlyph } from "./StudioBubbleVariantGlyph";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

import { cn } from "@/lib/utils";

export interface StudioBubbleToolPopoverBodyProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioBubbleToolPopoverBody({
  toolBelt,
}: StudioBubbleToolPopoverBodyProps) {
  const {
    dialogueScript,
    setDialogueBatchOpen,
    setDialogueScript,
    setDialogueTranslateOpen,
    setMenu,
  } = toolBelt;
  const {
    addBubble,
    addDialogueBubbles,
    openFeatureTutorial,
  } = toolBelt.stableHandlers;

  const insertDialogueScript = () => {
    if (!dialogueScript.trim()) return;
    void addDialogueBubbles();
  };

  return (
    <div data-studio-shortcut-boundary="true">
              <div className="relative overflow-hidden border-b border-line/50 bg-gradient-to-br from-accent-soft/35 via-card/60 to-panel px-3 pb-3 pt-3">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-4 -top-6 size-20 rounded-full bg-accent/10 blur-2xl"
                />
                <div className="relative flex items-start gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.12)]">
                    <MessageCircle size={18} aria-hidden strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[0.9rem] font-semibold tracking-tight text-fg">말풍선 골라 넣기</p>
                    <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                      장면에 맞는 목소리를 고르면 돼요. 대충 골라도 나중에 바꿀 수 있어요.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        openFeatureTutorial("bubble");
                      }}
                      className="mt-1 inline-flex min-h-11 items-center text-[0.65rem] font-medium text-accent/90 underline-offset-2 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      말풍선 튜토리얼 보기
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-b border-line/50 bg-canvas/25 px-2.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.72rem] font-semibold text-fg-2">대사를 바로 입력</p>
                    <p className="mt-0.5 text-[0.64rem] leading-snug text-fg-3">
                      한 줄에 한 마디. <span className="text-fg-2">이름: 대사</span>면 화자 자동,
                      <span className="text-fg-2"> (지문)</span>은 나레이션.
                    </p>
                  </div>
                  <kbd className="shrink-0 rounded-md border border-line/60 bg-card px-1.5 py-1 text-[0.58rem] font-medium text-fg-3">
                    ⌘/⌗ Enter
                  </kbd>
                </div>
                <textarea
                  value={dialogueScript}
                  onChange={(e) => setDialogueScript(e.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      insertDialogueScript();
                    }
                  }}
                  placeholder={"민수: 안녕?\n지영: 오랜만이야\n(잠시 후)"}
                  spellCheck
                  rows={3}
                  aria-label="대사 스크립트"
                  className="w-full resize-y rounded-xl border border-line/60 bg-card/80 px-2.5 py-2 text-[0.7rem] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3/80 focus:border-accent/45 focus:bg-card"
                />
                <button
                  type="button"
                  onClick={insertDialogueScript}
                  disabled={!dialogueScript.trim()}
                  className={cn(
                    "min-h-11 w-full rounded-xl px-2 text-xs font-semibold transition-[opacity,transform,background] duration-150",
                    dialogueScript.trim()
                      ? "bg-accent text-on-accent shadow-sm hover:opacity-95 active:scale-[0.99]"
                      : "cursor-not-allowed bg-card text-fg-3 ring-1 ring-line/50"
                  )}
                >
                  말풍선으로 한 번에 넣기
                </button>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setDialogueBatchOpen(true);
                    }}
                    className="min-h-11 rounded-xl border border-line/60 bg-card/70 px-2 text-[0.7rem] font-medium text-fg-2 transition-colors hover:bg-raised"
                  >
                    배치 대사 편집
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setDialogueBatchOpen(false);
                      setDialogueTranslateOpen(true);
                    }}
                    className="min-h-11 rounded-xl border border-line/60 bg-card/70 px-2 text-[0.7rem] font-medium text-fg-2 transition-colors hover:bg-raised"
                  >
                    번역 (내 API 키)
                  </button>
                </div>
              </div>

              <p
                id="studio-bubble-placement-help"
                className="mx-2.5 mt-2.5 rounded-xl border border-accent/20 bg-accent-soft/35 px-2.5 py-2 text-[0.62rem] leading-relaxed text-fg-2"
              >
                <strong className="font-semibold text-fg">클릭·탭</strong>은 선택 컷 또는 현재 화면에
                스마트 배치하고, <strong className="font-semibold text-fg">끌어 놓기</strong>는
                포인터 위치에 배치합니다. 드래그는 <kbd className="font-semibold">Esc</kbd>로 취소할 수 있어요.
              </p>

              <div className="space-y-3 p-2.5" role="menu" aria-label="말풍선 종류">
                {groupBubbleVariants().map((section) => (
                  <div key={section.group}>
                    <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.62rem] font-semibold text-fg-3">
                      <span className="inline-block size-1 rounded-full bg-accent/55" aria-hidden />
                      {section.group}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {section.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          role="menuitem"
                          onClick={() => addBubble(v.id, undefined, true)}
                          // 클릭=중앙/패널 규칙, 드래그=캔버스 드롭 지점 배치(onWrapDrop 이 처리).
                          draggable
                          onDragStart={(event) => {
                            writeStudioInsertDragPayload(event.dataTransfer, {
                              kind: "bubble",
                              variant: v.id,
                            });
                          }}
                          aria-describedby="studio-bubble-placement-help"
                          title={`${v.label} — 클릭·탭하면 선택 컷/현재 화면에, 끌면 놓은 위치에 추가됩니다`}
                          className="group flex min-h-[5.75rem] flex-col rounded-2xl border border-line/55 bg-gradient-to-b from-card/90 to-canvas/30 p-2 text-left shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.04)] transition-[border-color,background,transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 hover:bg-raised/80 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
                        >
                          <span className="flex h-12 items-center justify-center rounded-xl bg-canvas/45 ring-1 ring-line/35 transition-colors group-hover:bg-accent-soft/25 group-hover:ring-accent/20">
                            <StudioBubbleVariantGlyph
                              variant={v.id}
                              className="h-10 w-full text-fg-2 transition-colors duration-200 group-hover:text-accent"
                            />
                          </span>
                          <span className="mt-1.5 block text-[0.78rem] font-semibold tracking-tight text-fg">
                            {v.label}
                          </span>
                          <span className="mt-0.5 block text-[0.6rem] leading-snug text-fg-3">{v.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
    </div>
  );
}
