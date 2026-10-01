import { CalendarCheck2, ChevronRight, ListOrdered, MessageCircleQuestionMark, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { formatClock, type DeckTrackModel } from "./engineering-deck-model";
import { SEMINAR_PREP_CHECKLIST, SEMINAR_PREP_QUESTIONS } from "./engineering-seminar-prep-content";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringSeminarPrep", ko, en);

/** 리허설 체크는 이 브라우저에만 남는 개인 편의 기능이다(공유·서버 저장 없음). */
const CHECKLIST_STORAGE_KEY = "toonstudio-seminar-prep-checklist-v1";

function readChecklist(): readonly boolean[] {
  const empty = SEMINAR_PREP_CHECKLIST.map(() => false);
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return empty;
    const values: readonly unknown[] = parsed;
    return empty.map((_, index) => values[index] === true);
  } catch {
    return empty;
  }
}

/**
 * 발표자 준비실: 구간 시간표(발표 데이터에서 계산), 예상 질문, 리허설 체크리스트.
 * 시간표는 슬라이드 데이터가 단일 원본이며 여기서 별도 시간을 적지 않는다.
 */
export function EngineeringSeminarPrep({
  model,
  onJump,
}: {
  readonly model: DeckTrackModel;
  readonly onJump: (slideIndex: number) => void;
}) {
  useBilingualI18nRevision();
  const [checked, setChecked] = useState<readonly boolean[]>(readChecklist);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checked));
    } catch {
      // 저장소를 쓸 수 없으면 이 화면에서만 체크 상태를 유지한다.
    }
  }, [checked]);

  const doneCount = checked.filter(Boolean).length;
  const toggle = (index: number): void => {
    setChecked((previous) => previous.map((value, itemIndex) => (itemIndex === index ? !value : value)));
  };

  return (
    <section aria-labelledby="seminar-prep-title" className="mt-10 grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">{bi("발표자 준비실", "SPEAKER PREP")}</p>
          <h2 id="seminar-prep-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {bi("리허설에 필요한 세 가지", "Three things to rehearse")}
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-fg-2">
          {bi(
            "구간 시간표는 슬라이드별 계획 시간을 더한 값입니다. 발표 중에는 발표자 노트 패널이 예정보다 빠른지 늦은지를 알려 줍니다.",
            "The section schedule sums each slide's planned time. During the talk, the notes panel shows whether you are ahead of or behind plan.",
          )}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <h3 className="flex items-center gap-2 text-base font-black text-fg">
            <Timer size={17} className="text-accent" aria-hidden="true" />
            {formatI18nTemplate(String(bi("구간 시간표 · 총 {value0}", "Section schedule · {value0} total")), { value0: formatClock(model.totalSeconds) })}
          </h3>
          <ol className="mt-4 grid gap-2">
            {model.sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => onJump(section.firstSlideIndex)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-panel/70 px-3 py-2.5 text-left transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="font-display text-xs font-black tabular-nums text-accent">
                    {formatClock(section.startSeconds)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-fg">
                      {String(section.order).padStart(2, "0")} · {section.title}
                    </span>
                    <span className="block text-xs text-fg-3">
                      {formatI18nTemplate(String(bi("슬라이드 {value0}장", "{value0} slides")), { value0: section.slideCount })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-display text-xs font-bold tabular-nums text-fg-2">
                    {formatClock(section.seconds)}
                    <ChevronRight size={13} className="text-accent" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <h3 className="flex items-center gap-2 text-base font-black text-fg">
            <MessageCircleQuestionMark size={17} className="text-accent" aria-hidden="true" />
            {formatI18nTemplate(String(bi("예상 질문 {value0}개", "{value0} anticipated questions")), { value0: SEMINAR_PREP_QUESTIONS.length })}
          </h3>
          <p className="mt-2 text-xs leading-6 text-fg-3">
            {bi("모르는 질문에는 “기술 스토리의 근거를 확인하고 답변드리겠습니다.”", "For unknown questions: “Let me verify against the engineering story evidence and follow up.”")}
          </p>
          <div className="mt-3 grid gap-2">
            {SEMINAR_PREP_QUESTIONS.map((item, index) => (
              <details key={item.question.ko} className="group rounded-2xl border border-line bg-panel/70">
                <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold leading-6 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-accent">Q{index + 1}</span>
                  <span className="flex-1">{bi(item.question.ko, item.question.en)}</span>
                  <ChevronRight size={15} className="mt-1 shrink-0 text-fg-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="border-t border-line/70 px-3 py-3">
                  <p className="text-sm leading-7 text-fg-2">{bi(item.answer.ko, item.answer.en)}</p>
                  {item.glossaryId ? (
                    <Link
                      href={`/about/technology/glossary#glossary-${item.glossaryId}`}
                      className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent hover:underline"
                    >
                      {bi("용어집에서 쉬운 비유 보기", "See the plain-language analogy")}
                      <ChevronRight size={13} aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-line/70 bg-card/65 p-5">
          <h3 className="flex items-center gap-2 text-base font-black text-fg">
            <ListOrdered size={17} className="text-accent" aria-hidden="true" />
            {bi("리허설 체크리스트", "Rehearsal checklist")}
            <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-0.5 font-display text-xs font-black text-accent">
              {doneCount}/{SEMINAR_PREP_CHECKLIST.length}
            </span>
          </h3>
          <ul className="mt-4 grid gap-2">
            {SEMINAR_PREP_CHECKLIST.map((item, index) => {
              const done = checked[index] ?? false;
              return (
                <li key={item.ko}>
                  <label
                    className={cx(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm leading-6 transition-colors",
                      done ? "border-accent/30 bg-accent-soft/20 text-fg-3" : "border-line bg-panel/70 text-fg-2 hover:border-line-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(index)}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span className={done ? "line-through" : undefined}>{bi(item.ko, item.en)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-fg-3">
            <CalendarCheck2 size={14} className="mt-1 shrink-0" aria-hidden="true" />
            {bi("체크 상태는 이 브라우저에만 저장됩니다.", "Checkmarks are saved only in this browser.")}
          </p>
        </article>
      </div>
    </section>
  );
}
