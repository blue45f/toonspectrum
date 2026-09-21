import {
  Check,
  CircleDot,
  Copy,
  History,
  Library,
  Palette,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  getFriendlyColorName,
  getTintsAndShades,
} from "./studio-color-harmony-engine";
import { normalizeHexColor } from "./studio-color-utils";
import { createPalette } from "./studio-palette-library";
import { getProductStudioPaletteSqliteRepository } from "./studio-palette-sqlite-repository";
import { StudioColorDiscPicker } from "./StudioColorDiscPicker";
import { StudioColorHarmoniesPanel } from "./StudioColorHarmoniesPanel";
import { StudioColorQuickPicker } from "./StudioColorQuickPicker";
import { StudioWebtoonCelShadePanel } from "./StudioWebtoonCelShadePanel";

import { cn } from "@/shared/lib/utils";

type PaletteWorkbenchView = "quick" | "wheel" | "studio" | "library";
type PaletteStudioView = "harmony" | "webtoon";

type Feedback = {
  readonly tone: "success" | "error";
  readonly message: string;
};

export interface StudioPaletteWorkbenchProps {
  readonly value: string;
  readonly recentColors: readonly string[];
  readonly onPreviewColor: (hex: string) => void;
  readonly onCommitColor: (hex: string) => void;
  readonly libraryContent: ReactNode;
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

const VIEW_OPTIONS: readonly {
  readonly id: PaletteWorkbenchView;
  readonly label: string;
  readonly description: string;
  readonly icon: typeof SlidersHorizontal;
}[] = [
  {
    id: "quick",
    label: "빠른 선택",
    description: "채도·명도와 색조를 바로 조절",
    icon: SlidersHorizontal,
  },
  {
    id: "wheel",
    label: "색상환",
    description: "색조와 채도를 원형으로 탐색",
    icon: CircleDot,
  },
  {
    id: "studio",
    label: "조화·웹툰",
    description: "배색과 웹툰 음영을 자동 생성",
    icon: Sparkles,
  },
  {
    id: "library",
    label: "내 팔레트",
    description: "저장·가져오기·내보내기 관리",
    icon: Library,
  },
];

function normalizedUniqueColors(
  colors: readonly string[],
  limit = 18,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const color of colors) {
    const normalized = normalizeHexColor(color);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function StudioPaletteWorkbench({
  value,
  recentColors,
  onPreviewColor,
  onCommitColor,
  libraryContent,
}: StudioPaletteWorkbenchProps) {
  const currentColor = normalizeHexColor(value) ?? "#000000";
  const [activeView, setActiveView] = useState<PaletteWorkbenchView>("quick");
  const [studioView, setStudioView] = useState<PaletteStudioView>("harmony");
  const [hexDraft, setHexDraft] = useState(currentColor);
  const hexDraftPendingRef = useRef(false);
  const hexEditInitialRef = useRef(currentColor);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedRecentColors = useMemo(
    () => normalizedUniqueColors(recentColors),
    [recentColors],
  );
  const tintsAndShades = useMemo(
    () => getTintsAndShades(currentColor, 9),
    [currentColor],
  );
  const friendlyName = getFriendlyColorName(currentColor).split(" (")[0] ?? currentColor;

  useEffect(() => {
    if (!hexDraftPendingRef.current) setHexDraft(currentColor);
  }, [currentColor]);

  useEffect(() => () => {
    if (copiedTimeoutRef.current !== null) {
      clearTimeout(copiedTimeoutRef.current);
    }
    if (feedbackTimeoutRef.current !== null) {
      clearTimeout(feedbackTimeoutRef.current);
    }
  }, []);

  function showFeedback(next: Feedback): void {
    setFeedback(next);
    if (feedbackTimeoutRef.current !== null) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      feedbackTimeoutRef.current = null;
      setFeedback(null);
    }, 3_500);
  }

  function previewColor(raw: string): void {
    hexDraftPendingRef.current = false;
    const normalized = normalizeHexColor(raw);
    if (!normalized) return;
    setHexDraft(normalized);
    onPreviewColor(normalized);
  }

  function commitColor(raw: string): void {
    hexDraftPendingRef.current = false;
    const normalized = normalizeHexColor(raw);
    if (!normalized) return;
    setHexDraft(normalized);
    onPreviewColor(normalized);
    onCommitColor(normalized);
  }

  function commitHexDraft(): void {
    if (!hexDraftPendingRef.current) return;
    hexDraftPendingRef.current = false;
    const normalized = normalizeHexColor(hexDraft);
    if (!normalized) {
      setHexDraft(currentColor);
      showFeedback({
        tone: "error",
        message: "#RRGGBB 형식의 색상 코드를 입력해 주세요.",
      });
      return;
    }
    commitColor(normalized);
  }

  function copyCurrentColor(): void {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      showFeedback({
        tone: "error",
        message: "이 브라우저에서는 색상 코드 복사를 지원하지 않습니다.",
      });
      return;
    }
    void clipboard.writeText(currentColor).then(() => {
      setCopied(true);
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => {
        copiedTimeoutRef.current = null;
        setCopied(false);
      }, 1_500);
    }).catch(() => {
      showFeedback({
        tone: "error",
        message: "색상 코드를 복사하지 못했습니다.",
      });
    });
  }

  async function savePalette(name: string, colors: readonly string[]): Promise<void> {
    if (saving) return;
    const normalized = normalizedUniqueColors(colors, 24);
    if (normalized.length === 0) {
      showFeedback({
        tone: "error",
        message: "저장할 수 있는 색상이 없습니다.",
      });
      return;
    }
    setSaving(true);
    try {
      const repo = getProductStudioPaletteSqliteRepository();
      await repo.save(createPalette(name, normalized));
      showFeedback({
        tone: "success",
        message: `${name} 팔레트를 저장했습니다.`,
      });
    } catch {
      showFeedback({
        tone: "error",
        message: "팔레트를 저장하지 못했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  }

  function saveGeneratedPalette(name: string, colors: string[]): void {
    void savePalette(name, colors);
  }

  return (
    <section
      aria-label="색상 작업실"
      data-studio-palette-workbench="true"
      className="space-y-3 pb-1"
    >
      <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-soft/45 via-card to-card p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-14 shrink-0 rounded-2xl border border-white/20 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14),0_8px_20px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: currentColor }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-accent">
              현재 작업 색
            </p>
            <p className="mt-0.5 truncate text-sm font-black text-fg">
              {friendlyName}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <label className="min-w-0 flex-1">
                <span className="sr-only">현재 색상 코드</span>
                <input
                  type="text"
                  value={hexDraft}
                  spellCheck={false}
                  inputMode="text"
                  aria-label="현재 색상 코드"
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    if (!hexDraftPendingRef.current) hexEditInitialRef.current = currentColor;
                    hexDraftPendingRef.current = true;
                    setHexDraft(next);
                    const normalized = normalizeHexColor(next);
                    if (normalized) onPreviewColor(normalized);
                  }}
                  onBlur={commitHexDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      if (!hexDraftPendingRef.current) return;
                      event.preventDefault();
                      event.stopPropagation();
                      hexDraftPendingRef.current = false;
                      setHexDraft(hexEditInitialRef.current);
                      onPreviewColor(hexEditInitialRef.current);
                      return;
                    }
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.stopPropagation();
                    commitHexDraft();
                    event.currentTarget.select();
                  }}
                  className={cn(
                    "min-h-10 w-full rounded-xl border border-line bg-panel px-3 font-mono text-xs font-semibold uppercase tabular-nums text-fg shadow-inner",
                    FOCUS,
                  )}
                />
              </label>
              <button
                type="button"
                onClick={copyCurrentColor}
                aria-label="현재 색상 코드 복사"
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors hover:border-accent/50 hover:text-accent pointer-coarse:size-11",
                  FOCUS,
                )}
              >
                {copied ? <Check size={15} className="text-good" aria-hidden /> : <Copy size={15} aria-hidden />}
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void savePalette(
              `작업 색 ${currentColor}`,
              [currentColor, ...normalizedRecentColors],
            );
          }}
          className={cn(
            "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS,
          )}
        >
          <Palette size={15} aria-hidden />
          {saving ? "팔레트 저장 중…" : "현재 흐름을 내 팔레트로 저장"}
        </button>
      </div>

      <section aria-labelledby="studio-palette-recent-title" className="rounded-xl border border-line bg-card p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="studio-palette-recent-title" className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-2">
            <History size={14} className="text-accent" aria-hidden />
            최근 사용 색
          </h3>
          <span className="text-[0.62rem] text-fg-3">모든 모드에서 바로 적용</span>
        </div>
        {normalizedRecentColors.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="최근 사용 색상">
            {normalizedRecentColors.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={color === currentColor}
                aria-label={`최근 색상 ${color} 선택`}
                onClick={() => commitColor(color)}
                className={cn(
                  "relative size-10 rounded-xl border border-white/20 shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95 pointer-coarse:size-11",
                  "aria-checked:ring-2 aria-checked:ring-accent aria-checked:ring-offset-2 aria-checked:ring-offset-card",
                  FOCUS,
                )}
                style={{ backgroundColor: color }}
              >
                {color === currentColor ? (
                  <Check
                    size={15}
                    className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    aria-hidden
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-fg-3">
            색을 선택하면 최근 사용 색이 이곳에 쌓입니다.
          </p>
        )}
      </section>

      <div
        role="tablist"
        aria-label="색상 작업 방식"
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-raised/60 p-1"
      >
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = activeView === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${option.label}: ${option.description}`}
              onClick={() => setActiveView(option.id)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.7rem] font-semibold transition-colors",
                active
                  ? "border border-accent/40 bg-card text-accent shadow-sm"
                  : "border border-transparent text-fg-3 hover:bg-card/55 hover:text-fg",
                FOCUS,
              )}
            >
              <Icon size={14} aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="rounded-2xl border border-line bg-panel p-3">
        {activeView === "quick" ? (
          <div className="space-y-3" data-studio-palette-view="quick">
            <div>
              <h3 className="text-xs font-black text-fg">빠른 색상 선택</h3>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                넓은 영역에서 채도·명도를 고르고 아래 막대에서 색조를 조절합니다.
              </p>
            </div>
            <StudioColorQuickPicker
              value={currentColor}
              onPreview={previewColor}
              onCommit={commitColor}
            />
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg-2">밝기·음영 9단계</span>
                <span className="text-[0.62rem] text-fg-3">하이라이트 → 딥음영</span>
              </div>
              <div className="flex h-10 overflow-hidden rounded-xl border border-white/15 shadow-inner" role="radiogroup" aria-label="밝기와 음영 단계">
                {tintsAndShades.map((color, index) => (
                  <button
                    key={`${color}-${index}`}
                    type="button"
                    role="radio"
                    aria-checked={color === currentColor}
                    aria-label={`밝기 음영 ${index + 1}단계 ${color} 선택`}
                    onClick={() => commitColor(color)}
                    className={cn(
                      "relative min-w-7 flex-1 transition-transform hover:z-10 hover:scale-105 active:scale-95",
                      FOCUS,
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {color === currentColor ? (
                      <Check size={13} className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "wheel" ? (
          <div className="space-y-3" data-studio-palette-view="wheel">
            <div>
              <h3 className="text-xs font-black text-fg">색상환</h3>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                원하는 색조 방향과 채도를 한 번에 탐색합니다.
              </p>
            </div>
            <div className="flex justify-center rounded-xl bg-card/55 p-2">
              <StudioColorDiscPicker
                value={currentColor}
                onChange={previewColor}
                size={220}
              />
            </div>
            <button
              type="button"
              onClick={() => onCommitColor(currentColor)}
              className={cn(
                "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/20",
                FOCUS,
              )}
            >
              <Check size={15} aria-hidden />
              이 색을 최근 사용 색에 추가
            </button>
          </div>
        ) : null}

        {activeView === "studio" ? (
          <div className="space-y-3" data-studio-palette-view="studio">
            <div
              role="tablist"
              aria-label="전문 배색 방식"
              className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={studioView === "harmony"}
                onClick={() => setStudioView("harmony")}
                className={cn(
                  "min-h-11 rounded-lg text-xs font-bold transition-colors",
                  studioView === "harmony" ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-raised",
                  FOCUS,
                )}
              >
                조화 배색
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={studioView === "webtoon"}
                onClick={() => setStudioView("webtoon")}
                className={cn(
                  "min-h-11 rounded-lg text-xs font-bold transition-colors",
                  studioView === "webtoon" ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-raised",
                  FOCUS,
                )}
              >
                웹툰 음영
              </button>
            </div>
            {studioView === "harmony" ? (
              <StudioColorHarmoniesPanel
                value={currentColor}
                onSelectColor={commitColor}
                onSaveAsPalette={saveGeneratedPalette}
                saveFeedbackExternally
              />
            ) : (
              <StudioWebtoonCelShadePanel
                value={currentColor}
                onSelectColor={commitColor}
                onSaveAsPalette={saveGeneratedPalette}
                saveFeedbackExternally
              />
            )}
          </div>
        ) : null}

        {activeView === "library" ? (
          <div data-studio-palette-view="library">
            <div className="mb-3">
              <h3 className="text-xs font-black text-fg">내 팔레트 라이브러리</h3>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                저장한 팔레트를 검색·편집하고 GPL 파일로 가져오거나 내보냅니다.
              </p>
            </div>
            {libraryContent}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "rounded-xl border px-3 py-2.5 text-xs font-semibold leading-relaxed",
            feedback.tone === "success"
              ? "border-good/35 bg-good/10 text-good"
              : "border-bad/35 bg-bad/10 text-bad",
          )}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
