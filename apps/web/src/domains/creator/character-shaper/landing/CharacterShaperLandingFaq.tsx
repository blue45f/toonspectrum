import { ChevronDown } from "lucide-react";

import { CAPABILITY_NOTES, FAQ } from "./character-shaper-landing-copy";

import { Container, Section } from "@/shared/components/section";
import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

const SUMMARY_CLASS =
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-fg [word-break:keep-all] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden";
const DETAILS_CLASS = "group rounded-xl border border-line bg-card/40 open:border-line-strong open:bg-card/70";
const ANSWER_CLASS = "border-t border-line/70 px-4 pb-4 pt-3 text-sm leading-relaxed text-fg-2 [word-break:keep-all]";

/**
 * 자주 묻는 질문 + 지원 범위와 한계. 모두 한 줄 제목만 보이게 접어 두어 화면을 줄이되,
 * "모델에 따라 달라지는 것"과 같은 한계도 제목에 그대로 드러나 숨기지 않는다.
 */
export function CharacterShaperLandingFaq() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const faq = localize(FAQ.ko, FAQ.en);
  const capabilityNotes = CAPABILITY_NOTES.map((note) => ({ ...note, copy: localize(note.copy.ko, note.copy.en) }));

  return (
    <Container size="wide" className="studio-character-guide__section py-8 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <Section eyebrow="FAQ" title={bt("자주 묻는 질문", "Frequently asked questions")}>
          <div className="grid gap-2.5" data-character-shaper-faq="true">
            {faq.map((item) => (
              <details key={item.question} className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  {item.question}
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-fg-3 transition-transform duration-200 ease-out-expo group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <p className={ANSWER_CLASS}>{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="SCOPE"
          title={bt("지원 범위와 한계", "Scope and limits")}
          desc={bt("되는 것과 모델에 따라 달라지는 것을 미리 적어 둡니다.", "What works and what depends on the model, up front.")}
        >
          <ul className="grid gap-2.5" data-character-shaper-scope="true">
            {capabilityNotes.map((note) => {
              const Icon = note.icon;
              return (
                <li key={note.id}>
                  <details className={DETAILS_CLASS}>
                    <summary className={SUMMARY_CLASS}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon size={16} className="shrink-0 text-accent" aria-hidden />
                        {note.copy.title}
                      </span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className="shrink-0 text-fg-3 transition-transform duration-200 ease-out-expo group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <p className={ANSWER_CLASS}>{note.copy.body}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </Container>
  );
}
