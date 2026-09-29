import { CalendarCheck2, ListOrdered, MessageCircleQuestionMark, Timer } from "lucide-react";
import { useState } from "react";

import {
  SEMINAR_PREP_CHECKLIST,
  SEMINAR_PREP_PATH_30MIN,
  SEMINAR_PREP_QUESTIONS,
} from "./engineering-seminar-prep-content";
import { useEngineeringLocale } from "./use-engineering-locale";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringSeminarPrep", ko, en);

function localized(
  value: { readonly ko: string; readonly en: string },
  locale: string,
): string {
  return locale.startsWith("en") ? value.en : value.ko;
}

function formatRange(start: number, end: number): string {
  return `${start}:00–${end}:00`;
}

/**
 * 내일 세미나 발표자를 위한 준비실.
 * 32개 레슨 중 30분에 맞는 9개만 고른 추천 구성 + 예상 질문 10 + 오늘 밤 체크리스트.
 * 덱 페이지의 세미나 대상에서만 보여준다.
 */
export function EngineeringSeminarPrep() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState<readonly boolean[]>(
    SEMINAR_PREP_CHECKLIST.map(() => false),
  );

  const toggleCheck = (index: number): void => {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };
  const doneCount = checked.filter(Boolean).length;

  return (
    <section
      aria-labelledby="seminar-prep-title"
      className="mb-5 overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft/40 via-card to-card shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-6"
      >
        <span>
          <span className="text-xs font-bold tracking-widest text-accent">
            {bi("내일 세미나 · 발표자 준비실", "TOMORROW'S SEMINAR · SPEAKER PREP ROOM")}
          </span>
          <span
            id="seminar-prep-title"
            className="mt-2 block text-xl font-black text-fg sm:text-2xl"
          >
            {bi(
              "오늘 밤 이것만 준비하세요",
              "Tonight, prepare just this",
            )}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-full border border-line bg-card text-lg font-black text-fg-2 transition-transform",
            open ? "rotate-180" : "",
          )}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="space-y-8 border-t border-line/60 p-5 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-fg">
              <Timer size={16} className="text-accent" aria-hidden="true" />
              {bi("30분 추천 구성 — 9개 구간", "Recommended 30-minute arc — 9 segments")}
            </h3>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              {bi(
                "32개 레슨을 다 할 수 없습니다. 청중이 끝까지 따라오는 9개만 고르고, 각 구간에 무대에서 바로 말할 한 줄을 붙였습니다. 덱에서 해당 레슨을 찾아 발표자 노트와 함께 보세요.",
                "You can't cover all 32 lessons. These 9 keep the audience with you to the end, each with a stage-ready one-liner. Find each lesson in the deck and read it with its speaker notes.",
              )}
            </p>
            <ol className="mt-4 space-y-3">
              {SEMINAR_PREP_PATH_30MIN.map((step) => (
                <li
                  key={step.lessonId}
                  className="rounded-2xl border border-line bg-card/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-black text-accent">
                      {formatRange(step.startMinute, step.endMinute)}
                    </span>
                    <Link
                      href={`/about/technology/deck?audience=seminar&duration=30#${step.lessonId}`}
                      className="text-sm font-black text-fg hover:text-accent"
                    >
                      {localized(step.title, locale)}
                    </Link>
                  </div>
                  <p className="mt-2 border-l-2 border-accent/40 pl-3 text-sm leading-7 text-fg-2">
                    “{localized(step.speakLine, locale)}”
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-fg">
              <MessageCircleQuestionMark
                size={16}
                className="text-accent"
                aria-hidden="true"
              />
              {bi("예상 질문 TOP 10 — 답변 요지", "Top 10 anticipated questions — answer briefs")}
            </h3>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              {bi(
                "모르는 질문이 나오면 “기술 스토리의 근거를 확인하고 답변드리겠습니다.” 용어집 링크가 각 답변에 달려 있습니다.",
                "If a question stumps you: “Let me verify against the engineering story evidence and follow up.” Each answer links its glossary term.",
              )}
            </p>
            <div className="mt-4 space-y-3">
              {SEMINAR_PREP_QUESTIONS.map((item, index) => (
                <details
                  key={index}
                  className="rounded-2xl border border-line bg-card/70 p-4"
                >
                  <summary className="cursor-pointer py-1 text-sm font-black text-fg">
                    Q{index + 1}. {localized(item.question, locale)}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-fg-2">
                    {localized(item.answer, locale)}
                  </p>
                  {item.glossaryId ? (
                    <Link
                      href={`/about/technology/glossary#glossary-${item.glossaryId}`}
                      className="mt-2 inline-block text-xs font-bold text-accent hover:underline"
                    >
                      {bi("용어집에서 비유로 설명하기 →", "Explain with the glossary analogy →")}
                    </Link>
                  ) : null}
                </details>
              ))}
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-fg">
              <ListOrdered size={16} className="text-accent" aria-hidden="true" />
              {bi("오늘 밤 체크리스트", "Tonight's checklist")}
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-black text-accent">
                {doneCount}/{SEMINAR_PREP_CHECKLIST.length}
              </span>
            </h3>
            <ul className="mt-4 space-y-2">
              {SEMINAR_PREP_CHECKLIST.map((item, index) => {
                const done = checked[index] ?? false;
                return (
                  <li key={index}>
                    <label
                      className={cx(
                        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-7 transition-colors",
                        done
                          ? "border-accent/30 bg-accent-soft/20 text-fg-3"
                          : "border-line bg-card/70 text-fg-2 hover:border-line-strong",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleCheck(index)}
                        className="mt-1.5 size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className={done ? "line-through" : ""}>
                        {localized(item, locale)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-fg-3">
              <CalendarCheck2 size={14} aria-hidden="true" />
              {bi(
                "체크 상태는 이 화면에서만 유지됩니다. 내일 아침 덱을 열기 전 다시 확인하세요.",
                "Checkmarks live only on this screen. Review them again tomorrow morning before opening the deck.",
              )}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
