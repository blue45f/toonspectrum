// 배치된 대사 일괄 편집 패널(코미포식) — 캔버스의 말풍선·텍스트 요소를 목록으로 보고
// (1) 요소별 인라인 수정, (2) 전체/현재 페이지 찾아바꾸기, (3) 클릭으로 캔버스 선택을 제공한다.
// 순수 계산은 studio-dialogue-batch, 상태 커밋(히스토리)은 StudioPage(메인 루프)가 담당한다.
// 자체완결 플로팅 패널: 캔버스 컨테이너(relative) 안에서 우측에 떠 있고 Esc 로 닫힌다.
import {
  MessageCircle,
  Pause,
  Play,
  Replace,
  Search,
  Square,
  Type as TypeIcon,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import {
  collectDialogueItems,
  dialogueExcerpt,
  dialogueItemTypeLabel,
  filterDialogueItems,
  planDialogueReplace,
  type DialogueBatchItem,
  type DialoguePageLike,
  type DialogueReplacePlan,
  type DialogueReplaceScope,
} from "./studio-dialogue-batch";
import {
  buildDialogueReadAloudQueue,
  choosePreferredDialogueVoice,
  createBrowserDialogueSpeechAdapter,
  createDialogueReadAloudController,
  dialogueSpeechVoiceKey,
  isConfirmedLocalDialogueVoice,
  listDialogueSpeechVoices,
  type DialogueReadAloudPlaybackState,
  type DialogueSpeechAdapter,
} from "./studio-dialogue-read-aloud";

import { cx } from "@/lib/cx";

export type StudioDialogueBatchPanelProps = {
  /** 전체 페이지(요소·그룹 포함) — StudioPage 의 pages 를 그대로 받는다. */
  pages: readonly DialoguePageLike[];
  /** 현재 편집 중인 페이지 id(스코프 "현재 페이지"·현재 배지 기준). */
  currentPageId: string;
  /** 캔버스에서 선택된 요소 id(목록 하이라이트). */
  selectedId: string | null;
  onClose: () => void;
  /** 목록 행 클릭 → 해당 요소 선택(다른 페이지면 페이지 전환 포함). */
  onSelectElement: (pageId: string, elId: string) => void;
  /** 인라인 수정 확정(포커스 아웃/⌘Enter) — 텍스트가 실제로 바뀐 경우에만 호출된다. */
  onPatchText: (pageId: string, elId: string, text: string) => void;
  /** 찾아바꾸기 일괄 적용 — 메인 루프가 applyReplacePlanToPages 로 단일 커밋한다. */
  onApplyReplace: (plan: DialogueReplacePlan) => void;
  /** Web Speech API 테스트·점진 향상 경계. 운영에서는 브라우저 어댑터를 자동 생성한다. */
  readAloudAdapter?: DialogueSpeechAdapter;
  /** 모바일 소프트 키보드가 가린 높이. 스튜디오 도크와 함께 패널도 같은 만큼 올린다. */
  mobileKeyboardInset?: number;
};

const SCOPES: { id: DialogueReplaceScope; label: string }[] = [
  { id: "all", label: "전체 페이지" },
  { id: "current", label: "현재 페이지" },
];

const inputClass =
  "min-h-11 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

const READ_ALOUD_RATES = [0.6, 0.8, 1, 1.2, 1.4, 1.6] as const;

function playbackStatusText(
  playback: DialogueReadAloudPlaybackState,
  queueSize: number
): string {
  const progress =
    playback.currentIndex >= 0 && playback.total > 0
      ? `${playback.currentIndex + 1}/${playback.total}`
      : null;
  switch (playback.status) {
    case "unsupported":
      return "이 브라우저는 대사 낭독을 지원하지 않아요.";
    case "playing":
      return `낭독 중 · ${progress ?? "준비"}`;
    case "paused":
      return `일시 정지 · ${progress ?? "준비"}`;
    case "completed":
      return `낭독 검수 완료 · ${playback.total}개`;
    case "stopped":
      return "낭독을 중지했어요.";
    case "error":
      return "낭독을 시작하지 못했어요. 시스템 음성을 확인해 주세요.";
    default:
      return queueSize > 0 ? `검수할 대사 ${queueSize}개` : "낭독할 대사가 없어요.";
  }
}

export function StudioDialogueBatchPanel({
  pages,
  currentPageId,
  selectedId,
  onClose,
  onSelectElement,
  onPatchText,
  onApplyReplace,
  readAloudAdapter,
  mobileKeyboardInset = 0,
}: StudioDialogueBatchPanelProps) {
  // 찾아바꾸기 입력 — 찾기는 공백도 의미가 있어 trim 하지 않는다.
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [scope, setScope] = useState<DialogueReplaceScope>("all");
  const [caseSensitive, setCaseSensitive] = useState(false);
  // 목록 검색어(찾아바꾸기와 독립).
  const [listQuery, setListQuery] = useState("");
  // 인라인 수정 임시본 — 포커스 아웃/⌘Enter 에만 확정해 히스토리를 키 입력마다 만들지 않는다.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [speechAdapter] = useState<DialogueSpeechAdapter>(
    () => readAloudAdapter ?? createBrowserDialogueSpeechAdapter()
  );
  const locale = typeof navigator === "undefined" ? "ko-KR" : navigator.language || "ko-KR";
  const [voices, setVoices] = useState(() => listDialogueSpeechVoices(speechAdapter));
  const [allowOnlineVoices, setAllowOnlineVoices] = useState(false);
  const [selectedVoiceKey, setSelectedVoiceKey] = useState(() => {
    const confirmedLocalVoices = listDialogueSpeechVoices(speechAdapter).filter(
      isConfirmedLocalDialogueVoice
    );
    const preferred = choosePreferredDialogueVoice(
      confirmedLocalVoices,
      { lang: "ko-KR" },
      locale
    );
    return preferred ? dialogueSpeechVoiceKey(preferred) : "";
  });
  const [readAloudRate, setReadAloudRate] = useState(1);
  const [playback, setPlayback] = useState<DialogueReadAloudPlaybackState>(() => ({
    status: speechAdapter.supported ? "idle" : "unsupported",
    currentIndex: -1,
    total: 0,
    currentItemId: null,
    currentPageId: null,
    currentPageIndex: null,
  }));
  const [readAloudController] = useState(() =>
    createDialogueReadAloudController(speechAdapter, setPlayback)
  );

  const findInputRef = useRef<HTMLInputElement>(null);
  const readAloudHeadingId = useId();

  // 열리면 찾기 입력으로 포커스 이동(패널을 연 의도가 편집이므로).
  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  // 시스템 음성 목록은 일부 브라우저에서 비동기로 준비된다.
  useEffect(() => {
    const refreshVoices = () => {
      const next = listDialogueSpeechVoices(speechAdapter);
      setVoices(next);
      setSelectedVoiceKey((previous) => {
        if (next.some((voice) => dialogueSpeechVoiceKey(voice) === previous)) return previous;
        const preferred = choosePreferredDialogueVoice(next, { lang: "ko-KR" }, locale);
        return preferred ? dialogueSpeechVoiceKey(preferred) : "";
      });
    };
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = speechAdapter.subscribeVoices?.(refreshVoices);
    } catch {
      unsubscribe = undefined;
    }
    // 일부 Chromium/WebKit은 패널 구독 전에 음성 목록을 채우고 voiceschanged를 다시 보내지 않는다.
    // 즉시/짧은 지연 재조회로 그 경합을 복구하되 네트워크 요청이나 원문 접근은 하지 않는다.
    const refreshTimers = [0, 250, 1_000].map((delay) => window.setTimeout(refreshVoices, delay));
    return () => {
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      try {
        unsubscribe?.();
      } catch {
        // 브라우저 음성 기능이 사라졌어도 패널 정리는 계속한다.
      }
      // React StrictMode는 개발 중 effect를 setup→cleanup→setup으로 재생한다. 영구 dispose 대신
      // 현재 브라우저 큐만 해제해 두 번째 setup 이후에도 같은 controller를 안전하게 재사용한다.
      readAloudController.release();
    };
  }, [locale, readAloudController, speechAdapter]);

  // Esc 로 닫기 — 입력 필드 안의 Esc 는 임시본 되돌리기에 쓰므로 제외한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      readAloudController.stop();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, readAloudController]);

  const items = collectDialogueItems(pages);
  const shown = filterDialogueItems(items, listQuery);
  const readAloudQueue = buildDialogueReadAloudQueue(shown, drafts);
  const confirmedLocalVoices = voices.filter(isConfirmedLocalDialogueVoice);
  const onlineOrUnknownVoiceCount = voices.length - confirmedLocalVoices.length;
  const selectableVoices = allowOnlineVoices ? voices : confirmedLocalVoices;
  const selectedVoice =
    selectableVoices.find((voice) => dialogueSpeechVoiceKey(voice) === selectedVoiceKey) ??
    choosePreferredDialogueVoice(selectableVoices, { lang: "ko-KR" }, locale);
  // 페이지 순서대로 묶어 페이지 헤더를 붙인다(목록은 collect 가 페이지순으로 보장).
  const grouped: { pageId: string; pageIndex: number; items: DialogueBatchItem[] }[] = [];
  for (const item of shown) {
    const last = grouped[grouped.length - 1];
    if (last && last.pageId === item.pageId) last.items.push(item);
    else grouped.push({ pageId: item.pageId, pageIndex: item.pageIndex, items: [item] });
  }

  const plan = planDialogueReplace(pages, find, replaceWith, {
    caseSensitive,
    scope,
    currentPageId,
  });

  const commitDraft = (item: DialogueBatchItem) => {
    const draft = drafts[item.id];
    if (draft == null) return;
    setDrafts((prev) => {
      const { [item.id]: _omit, ...rest } = prev;
      return rest;
    });
    if (draft !== item.text) onPatchText(item.pageId, item.id, draft);
  };

  const revertDraft = (id: string) => {
    setDrafts((prev) => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const applyReplace = () => {
    if (plan.totalCount === 0) return;
    // 확정 전 임시본은 치환 결과를 가리므로 함께 비운다(예측 가능성).
    setDrafts({});
    onApplyReplace(plan);
  };

  const playShownDialogue = () => {
    if (!selectedVoice) return;
    // 임시본을 읽되 commitDraft/onPatchText 는 호출하지 않는다.
    readAloudController.play(readAloudQueue, {
      rate: readAloudRate,
      voice: selectedVoice,
    });
  };

  const playSingleDialogue = (item: DialogueBatchItem) => {
    if (!selectedVoice) return;
    // 낭독과 캔버스 점프는 별도 형제 버튼의 독립 동작이며 텍스트는 수정하지 않는다.
    onSelectElement(item.pageId, item.id);
    readAloudController.play(buildDialogueReadAloudQueue([item], drafts), {
      rate: readAloudRate,
      voice: selectedVoice,
    });
  };

  const togglePause = () => {
    if (playback.status === "paused") readAloudController.resume();
    else readAloudController.pause();
  };

  const canPause = playback.status === "playing" || playback.status === "paused";
  const isActive = playback.status === "playing" || playback.status === "paused";
  const statusText = selectedVoice
    ? playbackStatusText(playback, readAloudQueue.length)
    : voices.length === 0
      ? "사용 가능한 시스템 음성을 불러오는 중이에요."
      : "확인된 기기 내 음성이 없어요. 온라인 음성을 사용하려면 아래에서 명시적으로 허용하세요.";
  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;

  return (
    <section
      aria-label="대사 일괄 편집"
      className="fixed inset-x-2 bottom-[calc(7rem+env(safe-area-inset-bottom)+var(--studio-mobile-keyboard-inset))] top-[calc(4.25rem+env(safe-area-inset-top))] z-[54] flex w-auto flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-3 lg:z-40 lg:max-h-[calc(100%-5rem)] lg:w-[min(21rem,calc(100%-1.5rem))]"
      style={{
        "--studio-mobile-keyboard-inset": `${safeMobileKeyboardInset}px`,
      } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <p className="text-xs font-bold text-fg">
          대사 일괄 편집
          <span className="ml-1.5 font-medium text-fg-4">{items.length}개</span>
        </p>
        <button
          type="button"
          onClick={() => {
            readAloudController.stop();
            onClose();
          }}
          aria-label="대사 일괄 편집 닫기"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* 찾아바꾸기 — 적용 전 매치 미리보기를 보여주고, 적용은 실행취소 1회로 복구된다. */}
      <div className="space-y-1.5 border-b border-line/60 px-3 py-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            ref={findInputRef}
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="찾기"
            aria-label="찾을 대사"
            className={inputClass}
          />
          <input
            type="text"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            placeholder="바꾸기"
            aria-label="바꿀 대사"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              aria-pressed={scope === s.id}
              className={cx(
                "min-h-11 rounded-full border px-3 py-1 text-[0.62rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                scope === s.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised"
              )}
            >
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-1.5 text-[0.62rem] text-fg-3">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="accent-accent"
            />
            대소문자 구분
          </label>
        </div>
        {find ? (
          <p className="text-[0.62rem] leading-snug text-fg-3" role="status">
            {plan.totalCount > 0 ? (
              <>
                <span className="font-semibold text-fg-2">{plan.totalCount}건</span> · 요소{" "}
                {plan.elementCount}개 · {plan.pageCount}페이지
              </>
            ) : (
              "일치하는 대사가 없어요."
            )}
            {plan.lockedSkipped > 0 && (
              <span className="text-fg-4"> · 잠긴 요소 {plan.lockedSkipped}개 제외</span>
            )}
          </p>
        ) : (
          <p className="text-[0.62rem] leading-snug text-fg-4">
            찾을 문구를 입력하면 바꾸기 전에 매치 수를 미리 보여줘요.
          </p>
        )}
        <button
          type="button"
          onClick={applyReplace}
          disabled={plan.totalCount === 0}
          className={cx(
            "flex min-h-11 w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            plan.totalCount > 0
              ? "bg-accent text-on-accent hover:opacity-90"
              : "cursor-not-allowed bg-card text-fg-4"
          )}
        >
          <Replace size={12} /> 모두 바꾸기
        </button>
      </div>

      {/* 브라우저 내장 음성으로 페이지 순서의 대사를 들어보는 비파괴 검수 도구. */}
      <section
        aria-labelledby={readAloudHeadingId}
        className="space-y-2 border-b border-line/60 px-3 py-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <p id={readAloudHeadingId} className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
            <Volume2 size={14} aria-hidden />
            대사 낭독 검수
          </p>
          {speechAdapter.supported && (
            <span className="shrink-0 text-[0.6rem] tabular-nums text-fg-3">
              {readAloudQueue.length}개
            </span>
          )}
        </div>

        {!speechAdapter.supported ? (
          <p
            role="status"
            className="rounded-lg border border-line bg-card/45 px-2.5 py-2 text-[0.65rem] leading-relaxed text-fg-3"
          >
            이 브라우저는 음성 낭독을 지원하지 않아요. 대사 편집은 그대로 사용할 수 있습니다.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={playShownDialogue}
                disabled={readAloudQueue.length === 0 || !selectedVoice}
                aria-label="검색된 대사 전체 낭독"
                aria-pressed={isActive}
                aria-busy={playback.status === "playing"}
                className="flex min-h-11 items-center justify-center gap-1 rounded-lg bg-accent px-2 text-[0.65rem] font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={13} aria-hidden /> 전체 재생
              </button>
              <button
                type="button"
                onClick={togglePause}
                disabled={!canPause}
                aria-label={playback.status === "paused" ? "대사 낭독 계속" : "대사 낭독 일시 정지"}
                aria-pressed={playback.status === "paused"}
                className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.65rem] font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {playback.status === "paused" ? (
                  <Play size={13} aria-hidden />
                ) : (
                  <Pause size={13} aria-hidden />
                )}
                {playback.status === "paused" ? "계속" : "일시 정지"}
              </button>
              <button
                type="button"
                onClick={() => readAloudController.stop()}
                disabled={!isActive}
                aria-label="대사 낭독 중지"
                className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.65rem] font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Square size={12} aria-hidden /> 중지
              </button>
            </div>

            <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-1.5">
              <label className="min-w-0 text-[0.6rem] font-medium text-fg-3">
                속도 {readAloudRate.toFixed(1)}×
                <select
                  value={readAloudRate}
                  onChange={(event) => setReadAloudRate(Number(event.target.value))}
                  aria-label="대사 낭독 속도"
                  className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-[0.66rem] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {READ_ALOUD_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate.toFixed(1)}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-[0.6rem] font-medium text-fg-3">
                시스템 음성
                <select
                  value={selectedVoice ? dialogueSpeechVoiceKey(selectedVoice) : ""}
                  onChange={(event) => setSelectedVoiceKey(event.target.value)}
                  aria-label="대사 낭독 시스템 음성"
                  disabled={selectableVoices.length === 0}
                  className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-[0.66rem] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {selectableVoices.length === 0 ? (
                    <option value="">기기 내 음성 없음</option>
                  ) : (
                    selectableVoices.map((voice) => (
                      <option key={dialogueSpeechVoiceKey(voice)} value={dialogueSpeechVoiceKey(voice)}>
                        {voice.name} · {voice.lang} · {isConfirmedLocalDialogueVoice(voice) ? "기기 내" : "온라인 가능"}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {onlineOrUnknownVoiceCount > 0 ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 px-2.5 py-2 text-[0.62rem] leading-snug text-fg-2">
                <input
                  type="checkbox"
                  checked={allowOnlineVoices}
                  onChange={(event) => {
                    readAloudController.stop();
                    setAllowOnlineVoices(event.target.checked);
                  }}
                  aria-label="온라인 시스템 음성 허용"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="font-semibold">온라인 음성 허용</span>
                  <span className="mt-0.5 block text-fg-3">
                    선택하면 대사가 운영체제·브라우저의 음성 서비스로 전송될 수 있어요. ToonSpectrum 서버와 AI에는 보내지 않습니다.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-[0.6rem] leading-snug text-good">확인된 기기 내 음성만 사용합니다.</p>
            )}

            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={cx(
                "min-h-4 text-[0.62rem] leading-snug",
                playback.status === "error" ? "text-bad" : "text-fg-3"
              )}
            >
              {statusText}
            </p>
          </>
        )}
      </section>

      {/* 대사 목록 — 클릭=캔버스 선택, 텍스트는 그 자리에서 수정. */}
      <div className="px-3 py-2.5">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" aria-hidden />
          <input
            type="text"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="목록에서 검색..."
            aria-label="대사 목록 검색"
            className={cx(inputClass, "pl-6")}
          />
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            아직 말풍선·텍스트가 없어요. 상단 도구의 말풍선 메뉴에서 대사를 넣으면 여기에서 한꺼번에
            고칠 수 있어요.
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            검색과 일치하는 대사가 없어요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {grouped.map((group) => (
              <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 대사`}>
                <p className="mb-1 flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                  {group.pageIndex + 1}페이지
                  {group.pageId === currentPageId && (
                    <span className="rounded-full border border-accent/40 bg-accent-soft/40 px-1.5 text-[0.55rem] font-medium normal-case text-accent">
                      현재
                    </span>
                  )}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={cx(
                        "rounded-lg border p-1.5 transition-colors",
                        item.id === selectedId
                          ? "border-accent/60 bg-accent-soft/30"
                          : "border-line bg-card/45"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        {item.elType === "bubble" ? (
                          <MessageCircle size={11} className="shrink-0 text-fg-3" aria-hidden />
                        ) : (
                          <TypeIcon size={11} className="shrink-0 text-fg-3" aria-hidden />
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectElement(item.pageId, item.id)}
                          className="min-h-11 min-w-0 flex-1 truncate rounded-md px-1 text-left text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          aria-label={`${item.pageIndex + 1}페이지 ${dialogueItemTypeLabel(item)} "${dialogueExcerpt(item.text, 16)}" 캔버스에서 선택`}
                          title="캔버스에서 이 요소 선택"
                        >
                          {dialogueItemTypeLabel(item)}
                        </button>
                        {item.locked && (
                          <span className="shrink-0 rounded border border-line px-1 text-[0.55rem] text-fg-4">
                            잠김
                          </span>
                        )}
                        {item.hidden && (
                          <span className="shrink-0 rounded border border-line px-1 text-[0.55rem] text-fg-4">
                            숨김
                          </span>
                        )}
                        {speechAdapter.supported && (
                          <button
                            type="button"
                            onClick={() => playSingleDialogue(item)}
                            disabled={!selectedVoice || !(drafts[item.id] ?? item.text).trim()}
                            aria-label={`${item.pageIndex + 1}페이지 ${dialogueItemTypeLabel(item)} 대사만 낭독하고 캔버스에서 선택`}
                            aria-pressed={isActive && playback.currentItemId === item.id}
                            aria-busy={
                              playback.status === "playing" && playback.currentItemId === item.id
                            }
                            className={cx(
                              "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40",
                              isActive && playback.currentItemId === item.id
                                ? "border-accent bg-accent text-on-accent"
                                : "border-line bg-card text-fg-2 hover:bg-raised"
                            )}
                          >
                            <Volume2 size={16} aria-hidden />
                          </button>
                        )}
                      </div>
                      <textarea
                        value={drafts[item.id] ?? item.text}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => commitDraft(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            // 패널 닫힘(Esc)과 분리 — 임시본만 되돌린다.
                            e.stopPropagation();
                            revertDraft(item.id);
                          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.currentTarget.blur();
                          }
                        }}
                        disabled={item.locked}
                        rows={Math.min(4, Math.max(1, (drafts[item.id] ?? item.text).split("\n").length))}
                        aria-label={`${item.pageIndex + 1}페이지 ${dialogueItemTypeLabel(item)} 대사 수정`}
                        className={cx(
                          inputClass,
                          "resize-y py-1 leading-snug disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      </div>

      <p className="border-t border-line/60 px-3 py-1.5 text-[0.58rem] leading-snug text-fg-4">
        수정은 포커스 아웃 또는 ⌘Enter 로 저장 · 바꾸기/수정 모두 ⌘Z 로 복구할 수 있어요.
      </p>
    </section>
  );
}
