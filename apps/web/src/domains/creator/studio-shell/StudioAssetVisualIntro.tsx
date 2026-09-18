import { ArrowRight, Box, Brush, Image, Library, ShieldCheck, Store, Type, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import Link from "@/compat/router-link";

import { useI18n, useT } from "@/shared/lib/i18n";
import { translateParallelBilingualCopy } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-asset-visual-intro.css";

const COPY = {
  ko: {
    eyebrow: "보고 고르고 바로 쓰기",
    title: "소재 이름을 외우지 말고,\n필요한 장면부터 고르세요.",
    body: "브러시·배경·캐릭터·3D·폰트를 따로 찾아 헤매지 않도록 결과 이미지와 사용 맥락을 먼저 보여줍니다. 필요한 소재를 고르면 현재 프로젝트에 연결할 수 있어요.",
    heroAlt: "브러시, 배경, 캐릭터와 창작 소재가 펼쳐진 ToonStudio 오리지널 소재 비주얼",
    chips: ["브러시", "배경", "캐릭터", "3D", "폰트", "권리 확인"],
    essentials: "무료 제작 소재부터 보기",
    market: "마켓에서 더 찾기",
    library: "내 소재 열기",
    cards: [
      ["배경·3D", "원근과 구도가 필요한 컷에", "/brand/theme-scenes/midnight-studio.svg", "/studio/bg3d"],
      ["캐릭터·포즈", "표정과 포즈 참고가 필요할 때", "/brand/theme-scenes/aurora-studio.svg", "/studio/assets/characters/new"],
      ["브러시·텍스처", "선과 채색의 느낌을 바꾸고 싶을 때", "/brand/theme-scenes/ink-studio.svg", "/studio/brushes"],
    ],
  },
  en: {
    eyebrow: "SEE IT, CHOOSE IT, USE IT",
    title: "Start from the scene you need,\nnot an asset taxonomy.",
    body: "See the visual result and creative context first instead of hunting through separate brush, background, character, 3D and font systems. Pick what fits, then connect it to the current project.",
    heroAlt: "Original ToonStudio materials artwork showing brushes, backgrounds, characters and creative assets",
    chips: ["Brushes", "Backgrounds", "Characters", "3D", "Fonts", "Rights"],
    essentials: "Start with free essentials",
    market: "Find more in the market",
    library: "Open my materials",
    cards: [
      ["Backgrounds & 3D", "For panels that need perspective and composition", "/brand/theme-scenes/midnight-studio.svg", "/studio/bg3d"],
      ["Characters & poses", "When expressions and pose references matter", "/brand/theme-scenes/aurora-studio.svg", "/studio/assets/characters/new"],
      ["Brushes & texture", "When line and color need a different feel", "/brand/theme-scenes/ink-studio.svg", "/studio/brushes"],
    ],
  },
} as const;

const CHIP_ICONS = [Brush, Image, UserRound, Box, Type, ShieldCheck] as const;

export function StudioAssetVisualIntro({ locale: _locale }: { readonly locale?: string }) {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const copy = translateParallelBilingualCopy(t, "studioAssetVisualIntro", COPY);
  const reducedMotion = useReducedMotion();

  return (
    <section className="studio-asset-visual-intro" aria-labelledby="studio-asset-visual-title" lang={language}>
      <div className="studio-asset-visual-intro__hero">
        <motion.figure
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: .2 }}
          transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }}
        >
          <picture>
            <source media="(max-width: 720px)" srcSet="/brand/atelier-materials-640.webp" />
            <source media="(max-width: 1200px)" srcSet="/brand/atelier-materials-960.webp" />
            <img src="/brand/atelier-materials.webp" alt={copy.heroAlt} loading="eager" decoding="async" />
          </picture>
          <div className="studio-asset-visual-intro__chips">
            {copy.chips.map((label, index) => {
              const Icon = CHIP_ICONS[index] ?? Library;
              return <span key={label}><Icon size={14} aria-hidden="true" />{label}</span>;
            })}
          </div>
        </motion.figure>

        <div className="studio-asset-visual-intro__copy">
          <p className="studio-asset-visual-intro__eyebrow">{copy.eyebrow}</p>
          <h2 id="studio-asset-visual-title">{copy.title}</h2>
          <p>{copy.body}</p>
          <div className="studio-asset-visual-intro__actions">
            <Link href="/studio/assets?view=essentials"><Library size={16} aria-hidden="true" />{copy.essentials}<ArrowRight size={15} aria-hidden="true" /></Link>
            <Link href="/studio/assets?view=market"><Store size={16} aria-hidden="true" />{copy.market}</Link>
            <Link href="/studio/assets?view=library">{copy.library}</Link>
          </div>
        </div>
      </div>

      <div className="studio-asset-visual-intro__scenes">
        {copy.cards.map(([title, body, image, href], index) => (
          <motion.div
            key={title}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: .25 }}
            transition={{ duration: .4, delay: index * .06, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link href={href}>
              <span className="studio-asset-visual-intro__scene-media" aria-hidden="true"><img src={image} alt="" loading="lazy" decoding="async" /></span>
              <span className="studio-asset-visual-intro__scene-copy"><strong>{title}</strong><small>{body}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
