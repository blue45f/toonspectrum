import { GraduationCap, Keyboard, ListOrdered, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { CharacterShaperLearnCenter } from "../../CharacterShaperLearnCenter";
import { CharacterShaperLandingFeatures } from "./CharacterShaperLandingFeatures";
import { CharacterShaperLandingHowTo } from "./CharacterShaperLandingHowTo";
import { CharacterShaperLandingShortcuts } from "./CharacterShaperLandingShortcuts";

import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Container, Section } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type GuideTabId = "features" | "howto" | "learn" | "shortcuts";

const TAB_ORDER: readonly GuideTabId[] = ["features", "howto", "learn", "shortcuts"];
const TAB_ICONS: Readonly<Record<GuideTabId, LucideIcon>> = {
  features: Sparkles,
  howto: ListOrdered,
  learn: GraduationCap,
  shortcuts: Keyboard,
};
/** 소개 페이지의 "사용 가이드" 버튼이 가리키는 앵커. 열면 사용법 탭이 선택된다. */
const HOW_TO_HASH = "#how-to";

function tabFromHash(): GuideTabId | null {
  if (typeof window === "undefined") return null;
  return window.location.hash === HOW_TO_HASH ? "howto" : null;
}

const tabId = (id: GuideTabId) => `shaper-guide-tab-${id}`;
const panelId = (id: GuideTabId) => `shaper-guide-panel-${id}`;

/**
 * 기능 · 사용법 · 학습 · 조작법(제스처·단축키)을 한 번에 하나씩 보여 주는 탭 묶음.
 * 이전에는 네 구역이 세로로 이어져 휴대폰에서 6화면 넘게 길었다. 내용은 그대로 두고 탭으로 옮겼다.
 * 모든 패널은 마운트한 채 숨김만 바꿔, 학습 트랙 선택 같은 상태가 탭을 오가도 유지된다.
 */
export function CharacterShaperLandingGuide() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const [active, setActive] = useState<GuideTabId>(() => tabFromHash() ?? "features");

  useEffect(() => {
    const onHashChange = () => {
      const fromHash = tabFromHash();
      if (fromHash) setActive(fromHash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const labels: Readonly<Record<GuideTabId, string>> = {
    features: bt("핵심 기능", "Features"),
    howto: bt("사용법", "How to"),
    learn: bt("학습", "Learn"),
    shortcuts: bt("조작법", "Controls"),
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = TAB_ORDER.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % TAB_ORDER.length
          : (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    const next = TAB_ORDER[nextIndex];
    if (!next) return;
    setActive(next);
    event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <section id="how-to" className="scroll-mt-24 border-y border-line bg-panel/30" data-character-shaper-guide="true">
      <Container size="wide" className="studio-character-guide__section py-8 sm:py-12">
        <Section
          eyebrow="GUIDE"
          title={bt("기능과 사용법", "Features and how to use them")}
          desc={bt("탭을 눌러 필요한 설명만 골라 보세요.", "Pick a tab to read only what you need.")}
        >
          <div role="tablist" aria-label={bt("사용 안내 구역", "Guide sections")} className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {TAB_ORDER.map((id, index) => {
              const Icon = TAB_ICONS[id];
              const selected = id === active;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={tabId(id)}
                  aria-selected={selected}
                  aria-controls={panelId(id)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(id)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={cn(
                    "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-sm font-semibold transition-colors duration-150 [word-break:keep-all] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4",
                    selected
                      ? "border-accent bg-accent text-on-accent shadow-md shadow-accent/25"
                      : "border-line-strong bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon size={17} aria-hidden className="shrink-0" />
                  <span>{labels[id]}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {TAB_ORDER.map((id) => (
              <div
                key={id}
                role="tabpanel"
                id={panelId(id)}
                aria-labelledby={tabId(id)}
                hidden={id !== active}
                className="min-w-0"
              >
                {id === "features" ? <CharacterShaperLandingFeatures /> : null}
                {id === "howto" ? <CharacterShaperLandingHowTo /> : null}
                {id === "learn" ? <CharacterShaperLearnCenter /> : null}
                {id === "shortcuts" ? <CharacterShaperLandingShortcuts /> : null}
              </div>
            ))}
          </div>
        </Section>
      </Container>
    </section>
  );
}
