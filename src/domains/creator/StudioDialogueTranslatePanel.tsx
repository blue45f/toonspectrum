// 대사 번역(BYOK) 패널 — 캔버스의 말풍선·텍스트 요소를 사용자의 API 키로 다른 언어로 일괄
// 번역한다. draft prop 유무로 두 화면을 자동 전환한다: (A) 생성 화면(대상 언어·용어집 입력 →
// 번역 생성), (B) 검토·적용 화면(원문/번역 나란히, 손으로 고친 뒤 적용). 순수 계산은
// studio-dialogue-translate.ts(청크 분할·프롬프트·병합)와 studio-dialogue-batch.ts(목록화),
// 실제 BYOK 호출은 studio-ai-client.ts, 상태·히스토리 커밋은 StudioPage(메인 루프)가 담당한다.
// 자체완결 플로팅 패널: StudioDialogueBatchPanel과 동일한 셸(우측 상단, Esc로 닫힘).
import { Check, Globe2, Languages, Loader2, X } from "lucide-react";
import { useEffect } from "react";

import { collectDialogueItems, type DialoguePageLike } from "./studio-dialogue-batch";
import { DIALOGUE_LOCALE_PRESETS, SOURCE_LOCALE, localeLabel } from "./studio-dialogue-translate";

import { cx } from "@/lib/cx";

export type StudioDialogueTranslatePanelProps = {
  /** 전체 페이지(요소·그룹 포함) — StudioPage 의 pages 를 그대로 받는다. */
  pages: readonly DialoguePageLike[];
  /** API 키 설정 완료 여부 — false 면 "번역 생성" 이 비활성화된다(네트워크 요청 없음). */
  configured: boolean;
  /** 문서 전체에 지금 "표시 중"인 로케일(SOURCE_LOCALE 포함) — 칩 바 강조 표시 기준. */
  activeLocale: string;
  /** 이미 번역이 하나라도 있는 로케일 코드 목록(등장 순서, SOURCE_LOCALE 제외). */
  availableLocales: string[];
  coverageFor: (locale: string) => { total: number; translated: number };
  targetLocale: string;
  onTargetLocaleChange: (code: string) => void;
  glossary: string;
  onGlossaryChange: (value: string) => void;
  busy: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  /** 생성된 번역 초안 — null 이면 생성 화면, 채워지면 검토 화면으로 자동 전환. */
  draft: Map<string, string> | null;
  onGenerate: () => void;
  onDraftChange: (id: string, text: string) => void;
  onApplyDraft: () => void;
  onDiscardDraft: () => void;
  /** 재생성 없이 이미 만들어진 번역 사이를 토글(로케일 칩 클릭). */
  onSwitchLocale: (locale: string) => void;
  onClose: () => void;
};

// select 의 "직접 입력…" 옵션 값 — 실제 로케일 코드로 저장되지 않는 내부 센티널.
const CUSTOM_LOCALE_OPTION = "__custom__";

const inputClass =
  "w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50";

const localeChipClass = (active: boolean) =>
  cx(
    "rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
    active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-3 hover:bg-raised"
  );

export function StudioDialogueTranslatePanel({
  pages,
  configured,
  activeLocale,
  availableLocales,
  coverageFor,
  targetLocale,
  onTargetLocaleChange,
  glossary,
  onGlossaryChange,
  busy,
  progress,
  error,
  draft,
  onGenerate,
  onDraftChange,
  onApplyDraft,
  onDiscardDraft,
  onSwitchLocale,
  onClose,
}: StudioDialogueTranslatePanelProps) {
  // Esc 로 닫기 — 입력 필드 안의 Esc 는 무시한다(StudioDialogueBatchPanel 과 동일 관례).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 대상 언어가 프리셋 코드가 아니면(빈 문자열 포함) "직접 입력" 모드 — 별도 로컬 상태 없이
  // targetLocale 값 자체로부터 화면을 파생시킨다(이 패널은 상태를 소유하지 않는다).
  const isPresetTarget = DIALOGUE_LOCALE_PRESETS.some((p) => p.code === targetLocale);
  const items = collectDialogueItems(pages);
  const draftItems = draft ? items.filter((it) => draft.has(it.id)) : [];

  const grouped: { pageId: string; pageIndex: number; items: typeof draftItems }[] = [];
  for (const it of draftItems) {
    const last = grouped[grouped.length - 1];
    if (last && last.pageId === it.pageId) last.items.push(it);
    else grouped.push({ pageId: it.pageId, pageIndex: it.pageIndex, items: [it] });
  }

  const canGenerate = configured && !busy && items.length > 0;

  return (
    <section
      aria-label="대사 번역"
      className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-5rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Languages size={13} className="text-accent" aria-hidden />
          대사 번역
          <span className="font-medium text-fg-4">· 내 API 키</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="대사 번역 닫기"
          className="grid size-6 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={13} />
        </button>
      </div>

      {/* 로케일 칩 바 — 두 화면 공통. 클릭 시 재생성 없이 이미 만들어진 번역 사이를 즉시 토글한다. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line/60 px-3 py-2">
        <button
          type="button"
          onClick={() => onSwitchLocale(SOURCE_LOCALE)}
          aria-pressed={activeLocale === SOURCE_LOCALE}
          className={localeChipClass(activeLocale === SOURCE_LOCALE)}
        >
          원문
        </button>
        {availableLocales.map((code) => {
          const coverage = coverageFor(code);
          const pct = coverage.total > 0 ? Math.round((coverage.translated / coverage.total) * 100) : 0;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSwitchLocale(code)}
              aria-pressed={activeLocale === code}
              title={`${localeLabel(code)} · ${coverage.translated}/${coverage.total} 번역됨`}
              className={localeChipClass(activeLocale === code)}
            >
              {localeLabel(code)} <span className="opacity-70">{pct}%</span>
            </button>
          );
        })}
        {availableLocales.length === 0 && (
          <span className="text-[0.62rem] text-fg-4">아직 번역된 언어가 없어요.</span>
        )}
      </div>

      {draft === null ? (
        // ── A. 생성 화면 ──────────────────────────────────────────────────
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
          <div className="space-y-1">
            <label className="block text-[0.66rem] font-medium text-fg-3" htmlFor="dialogue-translate-target">
              대상 언어
            </label>
            {isPresetTarget ? (
              <select
                id="dialogue-translate-target"
                value={targetLocale}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_LOCALE_OPTION) onTargetLocaleChange("");
                  else onTargetLocaleChange(e.target.value);
                }}
                className={inputClass}
              >
                {DIALOGUE_LOCALE_PRESETS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM_LOCALE_OPTION}>직접 입력…</option>
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={targetLocale}
                  onChange={(e) => onTargetLocaleChange(e.target.value)}
                  placeholder="언어 코드 또는 이름(예: pt-BR, 베트남어)"
                  aria-label="대상 언어(직접 입력)"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => onTargetLocaleChange(DIALOGUE_LOCALE_PRESETS[0].code)}
                  className="shrink-0 whitespace-nowrap text-[0.62rem] font-medium text-accent hover:underline"
                >
                  목록에서 선택
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[0.66rem] font-medium text-fg-3" htmlFor="dialogue-translate-glossary">
              용어집(선택)
            </label>
            <textarea
              id="dialogue-translate-glossary"
              value={glossary}
              onChange={(e) => onGlossaryChange(e.target.value)}
              placeholder={'예: 주인공 이름은 항상 "Yuna"로 번역해줘'}
              rows={3}
              className={cx(inputClass, "resize-y leading-snug")}
            />
          </div>

          {!configured && (
            <p className="rounded-lg border border-dashed border-line px-2 py-2 text-[0.66rem] leading-relaxed text-fg-4">
              설정에서 API 키를 등록하세요.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-1.5 text-[0.66rem] leading-relaxed text-bad"
            >
              {error}
            </p>
          )}
          {busy && progress && (
            <p role="status" className="flex items-center gap-1.5 text-[0.66rem] text-fg-3">
              <Loader2 size={11} className="animate-spin text-accent" aria-hidden />
              {progress.done}/{progress.total} 청크 처리 중…
            </p>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className={cx(
              "flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
              canGenerate ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-4"
            )}
          >
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Globe2 size={12} aria-hidden />}
            번역 생성
          </button>
          {items.length === 0 && (
            <p className="text-center text-[0.62rem] text-fg-4">번역할 말풍선·텍스트가 없어요.</p>
          )}
        </div>
      ) : (
        // ── B. 검토·적용 화면 ─────────────────────────────────────────────
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            {grouped.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
                생성된 번역이 없어요.
              </p>
            ) : (
              <div className="space-y-2.5">
                {grouped.map((group) => (
                  <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 번역`}>
                    <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                      {group.pageIndex + 1}페이지
                    </p>
                    <ul className="space-y-1.5">
                      {group.items.map((entry) => (
                        <li key={entry.id} className="rounded-lg border border-line bg-card/45 p-1.5">
                          <p className="mb-1 truncate text-[0.64rem] text-fg-4" title={entry.text}>
                            원문: {entry.text}
                          </p>
                          <textarea
                            value={draft.get(entry.id) ?? entry.text}
                            onChange={(e) => onDraftChange(entry.id, e.target.value)}
                            rows={Math.min(4, Math.max(1, (draft.get(entry.id) ?? entry.text).split("\n").length))}
                            aria-label={`${group.pageIndex + 1}페이지 대사 번역 수정`}
                            className={cx(inputClass, "resize-y py-1 leading-snug")}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-line/60 px-3 py-2">
            <button
              type="button"
              onClick={onDiscardDraft}
              className="flex-1 rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onApplyDraft}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-on-accent transition-colors hover:opacity-90"
            >
              <Check size={12} aria-hidden /> 적용
            </button>
          </div>
        </>
      )}
    </section>
  );
}
