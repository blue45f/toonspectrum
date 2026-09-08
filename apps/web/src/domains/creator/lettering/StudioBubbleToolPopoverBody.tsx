import { MessageCircle, Sparkles } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { StudioAiEmotionBubbleMatcher } from "../ai/studio-ai-emotion-bubble-matcher";

import { StudioBubbleLibraryPanel } from "./StudioBubbleLibraryPanel";
import {
  BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY,
  EMPTY_BUBBLE_LIBRARY_PREFERENCES,
  bubbleVariantForDialogueRecommendation,
  dialogueSampleForBubbleRecommendation,
  getBubbleLibraryVariant,
  parseBubbleLibraryPreferences,
  readBubbleLibraryPreferences,
  recordBubbleUse,
  toggleBubbleFavorite,
  writeBubbleLibraryPreferences,
  type BubbleLibraryPreferences,
  type BubbleLibraryStorage,
} from "./studio-bubble-library";

import type { StudioToolBeltContentProps } from "../StudioToolBeltContent";
import type { BubbleVariant } from "../studio-assets";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface StudioBubbleToolPopoverBodyProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

const BUBBLE_RECOMMENDER = new StudioAiEmotionBubbleMatcher();

function localizeText(t: (key: string) => string, fallback: string, key: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function browserBubbleLibraryStorage(): BubbleLibraryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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
  const t = useT();
  const preferencesRef = useRef<BubbleLibraryPreferences>(
    EMPTY_BUBBLE_LIBRARY_PREFERENCES,
  );
  const [preferences, setPreferences] = useState<BubbleLibraryPreferences>(
    EMPTY_BUBBLE_LIBRARY_PREFERENCES,
  );

  useEffect(() => {
    const storage = browserBubbleLibraryStorage();
    if (!storage) return;
    const loaded = readBubbleLibraryPreferences(storage);
    preferencesRef.current = loaded;
    setPreferences(loaded);

    const syncAcrossTabs = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY
      ) {
        return;
      }
      const next =
        event.key === null
          ? EMPTY_BUBBLE_LIBRARY_PREFERENCES
          : parseBubbleLibraryPreferences(event.newValue);
      preferencesRef.current = next;
      setPreferences(next);
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, []);

  const recommendation = useMemo(() => {
    const sample = dialogueSampleForBubbleRecommendation(dialogueScript);
    if (!sample) return null;
    const matched = BUBBLE_RECOMMENDER.match(sample);
    const variant = getBubbleLibraryVariant(
      bubbleVariantForDialogueRecommendation(
        sample,
        matched.recommendedBubbleShape,
      ),
    );
    if (!variant) return null;
    return {
      variant,
      confidenceScore: matched.confidenceScore,
      needsHumanReview: matched.needsHumanReview,
    };
  }, [dialogueScript]);

  const commitPreferences = (
    update: (current: BubbleLibraryPreferences) => BubbleLibraryPreferences,
  ) => {
    const next = update(preferencesRef.current);
    preferencesRef.current = next;
    setPreferences(next);
    writeBubbleLibraryPreferences(browserBubbleLibraryStorage(), next);
  };

  const markBubbleUsed = (id: BubbleVariant) => {
    commitPreferences((current) => recordBubbleUse(current, id));
  };

  const insertBubble = (id: BubbleVariant) => {
    addBubble(id, undefined, true);
    markBubbleUsed(id);
  };

  const insertDialogueScript = () => {
    if (!dialogueScript.trim()) return;
    void addDialogueBubbles();
  };

  const handleBoundaryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.key !== "/" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    const searchInput = event.currentTarget.querySelector<HTMLInputElement>(
      "[data-studio-bubble-library-search='true']",
    );
    if (!searchInput) return;
    event.preventDefault();
    event.stopPropagation();
    searchInput.focus();
  };

  return (
    <div
      data-studio-shortcut-boundary="true"
      data-studio-bubble-library="true"
      onKeyDown={handleBoundaryKeyDown}
    >
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
            <p className="text-[0.9rem] font-semibold tracking-tight text-fg">
              {localizeText(t, "말풍선 골라 넣기", "studio.bubble.title")}
            </p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              {localizeText(
                t,
                "장면에 맞는 목소리를 고르면 돼요. 대충 골라도 나중에 바꿀 수 있어요.",
                "studio.bubble.description",
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                openFeatureTutorial("bubble");
              }}
              className="mt-1 inline-flex min-h-11 items-center text-[0.65rem] font-medium text-accent/90 underline-offset-2 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {localizeText(t, "말풍선 튜토리얼 보기", "studio.bubble.tutorial")}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-b border-line/50 bg-canvas/25 px-2.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[0.72rem] font-semibold text-fg-2">
              {localizeText(t, "대사를 바로 입력", "studio.bubble.subtitle")}
            </p>
            <p className="mt-0.5 text-[0.64rem] leading-snug text-fg-3">
              <span>
                {localizeText(
                  t,
                  "한 줄에 한 마디. ",
                  "studio.bubble.subtitleHint.first",
                )}
              </span>
              <span className="text-fg-2">
                {localizeText(
                  t,
                  "이름: 대사",
                  "studio.bubble.subtitleHint.speaker",
                )}
              </span>
              <span>
                {localizeText(
                  t,
                  "면 화자 자동, ",
                  "studio.bubble.subtitleHint.second",
                )}
              </span>
              <span className="text-fg-2">
                {localizeText(
                  t,
                  "(지문)",
                  "studio.bubble.subtitleHint.parentheses",
                )}
              </span>
              <span>
                {localizeText(
                  t,
                  "은 나레이션.",
                  "studio.bubble.subtitleHint.third",
                )}
              </span>
            </p>
          </div>
          <kbd className="shrink-0 rounded-md border border-line/60 bg-card px-1.5 py-1 text-[0.58rem] font-medium text-fg-3">
            ⌘/⌗ Enter
          </kbd>
        </div>
        <textarea
          value={dialogueScript}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setDialogueScript(event.target.value)
          }
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              insertDialogueScript();
            }
          }}
          placeholder={localizeText(
            t,
            "민수: 안녕?\n지영: 오랜만이야\n(잠시 후)",
            "studio.bubble.inputPlaceholder",
          )}
          spellCheck
          rows={3}
          aria-label={localizeText(t, "대사 스크립트", "studio.bubble.inputAria")}
          className="w-full resize-y rounded-xl border border-line/60 bg-card/80 px-2.5 py-2 text-[0.7rem] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3/80 focus:border-accent/45 focus:bg-card"
        />

        {recommendation ? (
          <div
            data-studio-bubble-recommendation={recommendation.variant.id}
            className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft/35 p-2"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card/75 text-accent ring-1 ring-accent/20">
              <Sparkles size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold text-fg">
                {localizeText(
                  t,
                  "대사 분위기 추천",
                  "studio.bubble.recommendation.title",
                )}
              </p>
              <p className="truncate text-[0.6rem] text-fg-3">
                {recommendation.variant.label} · {recommendation.confidenceScore}% ·{" "}
                {localizeText(
                  t,
                  "기기 안에서 분석",
                  "studio.bubble.recommendation.localOnly",
                )}
                {recommendation.needsHumanReview
                  ? ` · ${localizeText(
                      t,
                      "확인 권장",
                      "studio.bubble.recommendation.review",
                    )}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => insertBubble(recommendation.variant.id)}
              className="min-h-11 shrink-0 rounded-xl border border-accent/25 bg-card/85 px-3 text-[0.66rem] font-semibold text-accent transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {localizeText(
                t,
                "추천 넣기",
                "studio.bubble.recommendation.insert",
              )}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={insertDialogueScript}
          disabled={!dialogueScript.trim()}
          className={cn(
            "min-h-11 w-full rounded-xl px-2 text-xs font-semibold transition-[opacity,transform,background] duration-150",
            dialogueScript.trim()
              ? "bg-accent text-on-accent shadow-sm hover:opacity-95 active:scale-[0.99]"
              : "cursor-not-allowed bg-card text-fg-3 ring-1 ring-line/50",
          )}
        >
          {localizeText(t, "말풍선으로 한 번에 넣기", "studio.bubble.insertAll")}
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
            {localizeText(t, "배치 대사 편집", "studio.bubble.batchEdit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              setDialogueBatchOpen(false);
              setDialogueTranslateOpen("translate");
            }}
            className="min-h-11 rounded-xl border border-line/60 bg-card/70 px-2 text-[0.7rem] font-medium text-fg-2 transition-colors hover:bg-raised"
          >
            {localizeText(t, "번역 (내 API 키)", "studio.bubble.translate")}
          </button>
        </div>
      </div>

      <p
        id="studio-bubble-placement-help"
        className="mx-2.5 mt-2.5 rounded-xl border border-accent/20 bg-accent-soft/35 px-2.5 py-2 text-[0.62rem] leading-relaxed text-fg-2"
      >
        <strong className="font-semibold text-fg">
          {localizeText(t, "클릭·탭", "studio.bubble.placementHelp.title")}
        </strong>
        {localizeText(
          t,
          "는 선택 컷 또는 현재 화면에 스마트 배치하고,",
          "studio.bubble.placementHelp.when",
        )}
        <strong className="font-semibold text-fg">
          {localizeText(t, "끌어 놓기", "studio.bubble.placementHelp.drag")}
        </strong>
        {localizeText(
          t,
          "는 포인터 위치에 배치합니다. ",
          "studio.bubble.placementHelp.dragHint",
        )}
        {localizeText(
          t,
          "드래그는 ",
          "studio.bubble.placementHelp.dragEscapeLead",
        )}
        <kbd className="font-semibold">Esc</kbd>
        {localizeText(
          t,
          "로 취소할 수 있어요.",
          "studio.bubble.placementHelp.cancelHint",
        )}
      </p>

      <StudioBubbleLibraryPanel
        preferences={preferences}
        onInsertBubble={insertBubble}
        onMarkBubbleUsed={markBubbleUsed}
        onToggleFavorite={(id) =>
          commitPreferences((current) => toggleBubbleFavorite(current, id))
        }
      />
    </div>
  );
}
