import { Eye, Keyboard, MousePointer2, Move, Smartphone, Sparkles } from "lucide-react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

const COPY = {
  ko: {
    eyebrow: "ACCESSIBILITY",
    title: "누구나 핵심 작업을 끝까지 할 수 있도록.",
    body: "툰스튜디오는 키보드, 터치, 펜, 화면 확대와 모션 감소 설정을 고려해 인터페이스를 설계합니다. 아래 내용은 현재 제품 지원 원칙과 알려진 범위를 설명합니다.",
    items: [
      ["키보드와 포커스", "주요 탐색과 대화상자는 키보드로 이동할 수 있어야 하며, 포커스는 항상 화면에서 보여야 합니다."],
      ["터치와 펜", "모바일의 주요 터치 대상은 최소 44 CSS px을 기준으로 하고, 손가락과 펜 입력이 충돌하지 않도록 검증합니다."],
      ["색상과 대비", "색상만으로 상태를 전달하지 않고 텍스트·아이콘·형태를 함께 사용합니다."],
      ["모션 감소", "운영체제의 모션 감소 설정을 존중하고 장식 애니메이션을 줄입니다."],
      ["확대와 반응형", "텍스트 확대와 좁은 화면에서도 핵심 정보와 행동이 가려지지 않도록 구성합니다."],
      ["Studio 작업공간", "캔버스 바깥의 도구, 레이어, 메뉴와 대화상자 접근성을 우선 검증하며 전문 그래픽 조작의 대체 경로를 계속 확장합니다."],
    ],
    note: "접근성 문제가 작업을 막고 있다면 화면 이름, 사용 장치와 막힌 행동을 알려주세요. 가능한 재현 정보를 바탕으로 우선순위를 높여 수정합니다.",
    feedback: "접근성 문제 제보",
    help: "도움말 센터",
  },
  en: {
    eyebrow: "ACCESSIBILITY",
    title: "Core tasks should remain finishable for everyone.",
    body: "ToonStudio considers keyboard, touch, pen input, zoom and reduced-motion preferences. This page describes current product principles and known support boundaries.",
    items: [
      ["Keyboard & focus", "Primary navigation and dialogs should be keyboard reachable, with visible focus at all times."],
      ["Touch & pen", "Primary mobile targets use a 44 CSS px baseline and are tested to reduce conflicts between touch and pen input."],
      ["Color & contrast", "Status is not communicated by color alone; text, icons and shape provide redundant signals."],
      ["Reduced motion", "The interface respects reduced-motion preferences and suppresses decorative animation."],
      ["Zoom & responsive layout", "Important content and actions should remain available under text zoom and narrow viewports."],
      ["Studio workspace", "Accessibility is prioritized for tools, layers, menus and dialogs outside the canvas while alternative paths for specialist graphics interactions continue to expand."],
    ],
    note: "If an accessibility issue blocks a task, tell us the screen, device and blocked action. Reproducible reports are prioritized for fixes.",
    feedback: "Report an accessibility issue",
    help: "Help Center",
  },
} as const;

const ICONS = [Keyboard, MousePointer2, Eye, Move, Smartphone, Sparkles] as const;

export function AccessibilityPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  useDocumentTitle(locale === "ko" ? "접근성" : "Accessibility");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow text-accent">{copy.eyebrow}</p>
        <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.1rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
        <p className="mt-4 text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>
      </header>

      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {copy.items.map(([title, body], index) => {
          const Icon = ICONS[index];
          return (
            <section key={title} className="rounded-2xl border border-line bg-card/70 p-5">
              <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-accent"><Icon size={18} aria-hidden="true" /></span>
              <h2 className="mt-4 text-base font-bold text-fg">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-fg-3">{body}</p>
            </section>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft/30 p-5 sm:p-6">
        <p className="max-w-3xl text-sm leading-7 text-fg-2">{copy.note}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/feedback" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent">{copy.feedback}</Link>
          <Link href="/help" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg-2 hover:border-line-strong hover:text-fg">{copy.help}</Link>
        </div>
      </section>
    </Container>
  );
}
