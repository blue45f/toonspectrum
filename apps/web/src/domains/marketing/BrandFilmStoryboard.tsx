import {
  ArrowRight,
  BookOpen,
  Brush,
  Clapperboard,
  Rocket,
  formatI18nTemplate,
  motion,
  translateCurrentStaticSourceText,
  translateParallelBilingualCopy,
  type BilingualText,
  type LucideIcon } from "lucide-react";
import { AnimatePresence,
  useReducedMotion } from "motion/react";
import { useState } from "react";

import Link from "@/compat/router-link";
import {
  translateBilingualText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

import "./brand-film-storyboard.css";

type ChapterId = "imagine" | "draw" | "create" | "finish";

interface Chapter {
  readonly id: ChapterId;
  readonly icon: LucideIcon;
  readonly time: string;
  readonly image: string;
  readonly image640?: string;
  readonly image960?: string;
  readonly title: BilingualText;
  readonly body: BilingualText;
  readonly action: BilingualText;
  readonly href: string;
}

const CHAPTERS: readonly Chapter[] = [
  {
    id: "imagine",
    icon: BookOpen,
    time: "00–06",
    image: "/brand/atelier-process.webp",
    image640: "/brand/atelier-process-640.webp",
    image960: "/brand/atelier-process-960.webp",
    title: { ko: "아이디어를 첫 장면으로", en: "Turn an idea into a first scene" },
    body: {
      ko: "기획과 대본을 완벽하게 준비한 뒤 시작할 필요가 없습니다. 지금 가진 아이디어에서 바로 장면과 컷으로 이어갑니다.",
      en: "You do not need a perfect plan first. Start from the material you have and move directly into scenes and panels.",
    },
    action: { ko: "기획에서 시작", en: "Start planning" },
    href: "/story-lab",
  },
  {
    id: "draw",
    icon: Brush,
    time: "06–12",
    image: "/brand/atelier-world.webp",
    image640: "/brand/atelier-world-640.webp",
    image960: "/brand/atelier-world-960.webp",
    title: { ko: "그리면서 바로 표현하기", en: "Draw and shape the scene directly" },
    body: {
      ko: "브러시·레이어·보정 같은 핵심 도구는 가까이 두고, 전문 설정은 필요할 때만 펼칩니다. 캔버스가 항상 주인공입니다.",
      en: "Keep essential brushes, layers and corrections close while advanced controls appear only when needed. The canvas stays central.",
    },
    action: { ko: "2D 작업 시작", en: "Start drawing" },
    href: "/studio/new?kind=illustration",
  },
  {
    id: "create",
    icon: Clapperboard,
    time: "12–18",
    image: "/brand/production-os-workspace.svg",
    title: { ko: "컷·말풍선·3D로 장면 확장", en: "Expand scenes with panels, dialogue and 3D" },
    body: {
      ko: "2D 원고와 3D 배경, 소재를 따로 관리하지 않고 현재 컷이라는 같은 맥락 안에서 연결합니다.",
      en: "Keep 2D art, 3D scenes and reusable assets connected to the same panel instead of treating them as separate products.",
    },
    action: { ko: "3D 장면 둘러보기", en: "Explore 3D scenes" },
    href: "/studio/bg3d",
  },
  {
    id: "finish",
    icon: Rocket,
    time: "18–24",
    image: "/brand/production-os-journey.svg",
    title: { ko: "검토하고, 독자에게 공개하기", en: "Review the work, then prepare it for readers" },
    body: {
      ko: "작업물·수정 요청·승인·규격 확인을 하나의 흐름으로 연결해 마지막 단계까지 다음 행동이 분명하게 보이도록 합니다.",
      en: "Connect artwork, revisions, approval and delivery checks so the next action remains clear through the final step.",
    },
    action: { ko: "연재 준비 보기", en: "Prepare to publish" },
    href: "/studio/publish",
  },
] as const;

const COPY = {
  ko: {
    eyebrow: "4 CHAPTER VISUAL STORYBOARD",
    title: "영상을 보기 전에도,\n24초 흐름이 한눈에.",
    intro: "브랜드 필름의 네 장면을 실제 제품 흐름과 연결했습니다. 카드를 선택하면 해당 단계가 무엇을 의미하는지 이미지와 짧은 문장으로 바로 이해할 수 있어요.",
    visualAlt: "ToonStudio Remotion 브랜드 필름 챕터를 설명하는 비주얼",
    chapterLabel: "영상 챕터",
  },
  en: {
    eyebrow: "4 CHAPTER VISUAL STORYBOARD",
    title: "Understand the 24-second story\nbefore pressing play.",
    intro: "Each brand-film chapter is connected to a real product journey. Select a card to see the outcome, visual context and next action immediately.",
    visualAlt: "Visual explaining a ToonStudio Remotion brand-film chapter",
    chapterLabel: "Film chapters",
  },
} as const;

function ChapterPicture({ chapter, alt }: { chapter: Chapter; alt: string }) {
  if (chapter.image.endsWith(".webp") && chapter.image640 && chapter.image960) {
    return (
      <picture>
        <source media="(max-width: 720px)" srcSet={chapter.image640} />
        <source media="(max-width: 1200px)" srcSet={chapter.image960} />
        <img src={chapter.image} alt={alt} loading="lazy" decoding="async" />
      </picture>
    );
  }
  return <img src={chapter.image} alt={alt} loading="lazy" decoding="async" />;
}

export function BrandFilmStoryboard() {
  const t = useT();
  const copy = translateParallelBilingualCopy(t, "brandFilmStoryboard", COPY);
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<ChapterId>("imagine");
  const active = CHAPTERS.find((chapter) => chapter.id === activeId) ?? CHAPTERS[0];
  const activeTitle = translateBilingualText(t, `brandFilmStoryboard.chapter.${active.id}.title`, active.title);
  const activeBody = translateBilingualText(t, `brandFilmStoryboard.chapter.${active.id}.body`, active.body);
  const activeAction = translateBilingualText(t, `brandFilmStoryboard.chapter.${active.id}.action`, active.action);
  const ActiveIcon = active.icon;

  return (
    <section className="brand-film-storyboard" aria-labelledby="brand-film-storyboard-title">
      <header className="brand-film-storyboard__heading">
        <div>
          <p>{copy.eyebrow}</p>
          <h2 id="brand-film-storyboard-title">{copy.title}</h2>
        </div>
        <p>{copy.intro}</p>
      </header>

      <div className="brand-film-storyboard__layout">
        <nav className="brand-film-storyboard__chapters" aria-label={copy.chapterLabel}>
          {CHAPTERS.map((chapter, index) => {
            const Icon = chapter.icon;
            const selected = chapter.id === active.id;
            const title = translateBilingualText(
              t,
              `brandFilmStoryboard.chapter.${chapter.id}.title`,
              chapter.title,
            );
            return (
              <button key={chapter.id} type="button" aria-pressed={selected} onClick={() => setActiveId(chapter.id)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={18} aria-hidden="true" />
                <strong>{title}</strong>
                <small>{chapter.time}s</small>
              </button>
            );
          })}
        </nav>

        <div className="brand-film-storyboard__stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.figure
              key={active.id}
              initial={reducedMotion ? false : { opacity: 0, scale: .985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 1.012 }}
              transition={{ duration: .34, ease: [0.16, 1, 0.3, 1] }}
            >
              <ChapterPicture chapter={active} alt={`${copy.visualAlt}: ${activeTitle}`} />
              <figcaption><ActiveIcon size={15} aria-hidden="true" />{active.time}s · {activeTitle}</figcaption>
            </motion.figure>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.BrandFilmStoryboard", "en", "{v0}-detail"), { v0: String(active.id) })}
              className="brand-film-storyboard__detail"
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: .28, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>{active.time}s</span>
              <h3>{activeTitle}</h3>
              <p>{activeBody}</p>
              <Link href={active.href}>{activeAction}<ArrowRight size={15} aria-hidden="true" /></Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
