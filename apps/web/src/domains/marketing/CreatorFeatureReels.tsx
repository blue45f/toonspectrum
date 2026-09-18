import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  Box,
  Brush,
  Cloud,
  FileCheck2,
  PackageOpen,
  Pause,
  Play,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { resolveProductLocale } from "@/shared/lib/product-identity";

import "./creator-feature-reels.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CreatorFeatureReels", ko, en);

type ReelId = "draw" | "three-d" | "assets" | "continuity" | "collaborate" | "publish";

interface ReelVisual {
  readonly id: ReelId;
  readonly icon: LucideIcon;
  readonly image: string;
  readonly image640?: string;
  readonly image960?: string;
  readonly href: string;
  readonly label: Readonly<Record<ProductLocale, string>>;
  readonly title: Readonly<Record<ProductLocale, string>>;
  readonly body: Readonly<Record<ProductLocale, string>>;
  readonly action: Readonly<Record<ProductLocale, string>>;
  readonly proof: Readonly<Record<ProductLocale, readonly string[]>>;
  readonly position?: string;
}

const REELS: readonly ReelVisual[] = [
  {
    id: "draw",
    icon: Brush,
    image: "/brand/atelier-process.webp",
    image640: "/brand/atelier-process-640.webp",
    image960: "/brand/atelier-process-960.webp",
    href: "/studio/new?kind=illustration",
    label: { ko: "2D DRAWING", en: "2D DRAWING" },
    title: { ko: "러프에서 완성까지, 한 화면에서.", en: "From rough sketch to final color, in one workspace." },
    body: {
      ko: "브러시·레이어·선택·보정·말풍선과 식자를 작업 흐름 안에서 바로 이어갑니다. 기능 이름보다 지금 그리고 있는 장면이 중심입니다.",
      en: "Move through brushes, layers, selection, corrections, balloons and lettering without leaving the creative flow.",
    },
    action: { ko: "2D 작업 시작", en: "Start drawing" },
    proof: { ko: ["전문 브러시", "레이어·보정", "컷·말풍선"], en: ["Pro brushes", "Layers & corrections", "Panels & balloons"] },
  },
  {
    id: "three-d",
    icon: Box,
    image: "/brand/production-os-workspace.svg",
    href: "/studio/bg3d",
    label: { ko: "3D SCENE", en: "3D SCENE" },
    title: { ko: "배경과 포즈를 직접 돌려보고, 바로 컷에.", en: "Pose the scene, frame the camera, then bring it into the panel." },
    body: {
      ko: "3D를 별도 프로그램처럼 배우게 하지 않습니다. 배경 추가 → 위치·크기·방향 조정 → 현재 컷 적용의 순서로 필요한 조작만 먼저 보여줍니다.",
      en: "3D starts from a creator task: add a scene, adjust position and camera, then apply it to the current panel.",
    },
    action: { ko: "3D 장면 만들기", en: "Create a 3D scene" },
    proof: { ko: ["배경·소품", "포즈·카메라", "컷에 바로 적용"], en: ["Sets & props", "Pose & camera", "Apply to panel"] },
    position: "center",
  },
  {
    id: "assets",
    icon: PackageOpen,
    image: "/brand/atelier-materials.webp",
    image640: "/brand/atelier-materials-640.webp",
    image960: "/brand/atelier-materials-960.webp",
    href: "/studio/assets",
    label: { ko: "ASSETS", en: "ASSETS" },
    title: { ko: "필요한 재료를 찾고, 끌어다 바로 쓰세요.", en: "Find the right material and use it where you are." },
    body: {
      ko: "브러시·배경·캐릭터·3D·폰트를 파일 구조가 아니라 창작 목적별로 탐색하고, 사용 권리까지 확인한 뒤 현재 프로젝트에 추가합니다.",
      en: "Browse brushes, backgrounds, characters, 3D and fonts by creative purpose, check rights, then add them to the current project.",
    },
    action: { ko: "소재 둘러보기", en: "Browse assets" },
    proof: { ko: ["브러시", "배경·3D", "권리 확인"], en: ["Brushes", "Backgrounds & 3D", "Rights check"] },
  },
  {
    id: "continuity",
    icon: Cloud,
    image: "/brand/production-os-hero.svg",
    href: "/studio/projects",
    label: { ko: "SAVE & CONTINUE", en: "SAVE & CONTINUE" },
    title: { ko: "저장은 신경 쓰지 말고, 이어서 그리세요.", en: "Keep creating without managing save steps." },
    body: {
      ko: "작업 중에는 자동 저장 상태만 간단히 보여주고, 버전·복구·다른 기기 이어하기는 필요할 때 꺼냅니다. 저장과 내보내기를 명확히 분리합니다.",
      en: "Autosave stays quiet while versions, recovery and cross-device continuation appear only when needed. Saving and exporting remain distinct.",
    },
    action: { ko: "내 작업 이어가기", en: "Continue my work" },
    proof: { ko: ["자동 저장", "버전·복구", "다른 기기 이어하기"], en: ["Autosave", "Versions & recovery", "Continue anywhere"] },
    position: "56% center",
  },
  {
    id: "collaborate",
    icon: Users,
    image: "/brand/production-os-journey.svg",
    href: "/production",
    label: { ko: "PRODUCTION", en: "PRODUCTION" },
    title: { ko: "파일이 아니라, 작품의 진행 상태를 공유하세요.", en: "Share production state, not a pile of disconnected files." },
    body: {
      ko: "회차·컷·담당자·마감·수정 요청이 실제 작업물과 연결됩니다. 누가 무엇을 해야 하는지 한 화면에서 다음 행동으로 이어집니다.",
      en: "Episodes, panels, owners, deadlines and revision requests stay attached to the actual work and its next action.",
    },
    action: { ko: "제작 흐름 보기", en: "See production flow" },
    proof: { ko: ["담당자·마감", "수정 요청", "승인 상태"], en: ["Owners & deadlines", "Revision requests", "Approval state"] },
    position: "center",
  },
  {
    id: "publish",
    icon: FileCheck2,
    image: "/brand/atelier-world.webp",
    image640: "/brand/atelier-world-640.webp",
    image960: "/brand/atelier-world-960.webp",
    href: "/studio/publish",
    label: { ko: "REVIEW & PUBLISH", en: "REVIEW & PUBLISH" },
    title: { ko: "완성한 장면을, 독자가 보는 형태로 확인하세요.", en: "See the finished work the way readers will see it." },
    body: {
      ko: "검수본·승인본·게시본을 구분하고 모바일 미리보기와 플랫폼 규격을 확인합니다. 마지막 단계도 기술 용어보다 결과를 먼저 보여줍니다.",
      en: "Separate review, approved and release versions, preview the mobile reading experience and check platform requirements before publishing.",
    },
    action: { ko: "연재 준비하기", en: "Prepare to publish" },
    proof: { ko: ["모바일 미리보기", "규격 확인", "승인·게시본"], en: ["Mobile preview", "Format checks", "Approved release"] },
  },
] as const;

const COPY = {
  ko: {
    eyebrow: "기능을 읽지 말고, 직접 보세요",
    title: "복잡한 기능은 숨기고,\n결과를 먼저 보여줍니다.",
    intro: "아래 기능을 선택하면 실제 작업 맥락에 가까운 비주얼과 핵심 행동만 보여줍니다. 필요한 깊이는 사용하면서 자연스럽게 열립니다.",
    choose: "기능 미리보기",
    visualAlt: "ToonStudio 기능을 설명하는 오리지널 제품 비주얼",
    filmEyebrow: "REMOTION PRODUCT FILM",
    filmTitle: "24초로 감을 잡고, 8분 투어로 전체를 이해하세요.",
    filmBody: "짧은 브랜드 필름으로 방향을 먼저 보고, 실제 제품 화면이 필요한 경우 8분 24초 상세 투어에서 9개 제작 챕터를 이어서 확인하세요.",
    filmPlay: "24초 영상 재생",
    filmPause: "영상 일시정지",
    filmOpen: "24초 큰 화면",
    tourOpen: "8분 24초 전체 투어",
    finalTitle: "설명서를 읽기 전에, 만들어보세요.",
    finalBody: "처음에는 가장 쉬운 선택만 보여주고, 전문 기능은 필요한 순간에 나타납니다.",
    finalAction: "새 작품 시작하기",
  },
  en: {
    eyebrow: "SEE THE FEATURE BEFORE READING ABOUT IT",
    title: "Keep complexity backstage.\nShow the result first.",
    intro: "Pick a capability to see the visual outcome and primary action first. Deeper controls appear progressively as you work.",
    choose: "Feature preview",
    visualAlt: "Original ToonStudio product visual explaining a creative capability",
    filmEyebrow: "REMOTION PRODUCT FILM",
    filmTitle: "Get the idea in 24 seconds, then understand the whole product in 8 minutes.",
    filmBody: "Use the short brand film for orientation, then continue into the 8m24s tour when you want nine chapters built from real product screens.",
    filmPlay: "Play 24-second film",
    filmPause: "Pause film",
    filmOpen: "Open 24-second film",
    tourOpen: "Open 8m24s full tour",
    finalTitle: "Create before you read a manual.",
    finalBody: "The easiest choices appear first. Professional depth arrives only when the task needs it.",
    finalAction: "Start a new work",
  },
} as const;

function ReelPicture({ reel, alt }: { reel: ReelVisual; alt: string }) {
  useBilingualI18nRevision();
  if (reel.image.endsWith(".webp") && reel.image640 && reel.image960) {
    return (
      <picture>
        <source media="(max-width: 720px)" srcSet={reel.image640} />
        <source media="(max-width: 1200px)" srcSet={reel.image960} />
        <img src={reel.image} alt={alt} loading="lazy" decoding="async" />
      </picture>
    );
  }
  return <img src={reel.image} alt={alt} loading="lazy" decoding="async" />;
}

export function CreatorFeatureReels({ showFilm = true, embedded = false }: { readonly showFilm?: boolean; readonly embedded?: boolean } = {}) {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const copy = bi((COPY).ko, (COPY).en);
  const prefersReducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<ReelId>("draw");
  const [filmMounted, setFilmMounted] = useState(false);
  const active = REELS.find((item) => item.id === activeId) ?? REELS[0];
  const ActiveIcon = active.icon;

  return (
    <section className={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "en", "creator-feature-reels{v0}"), { v0: String(embedded ? " creator-feature-reels--embedded" : "") })} aria-labelledby={embedded ? undefined : translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "en", "creator-feature-reels-title")} lang={locale}>
      <div className="creator-feature-reels__shell">
        {!embedded ? (
          <header className="creator-feature-reels__heading">
            <div>
              <p className="creator-feature-reels__eyebrow"><Sparkles size={14} aria-hidden="true" />{copy.eyebrow}</p>
              <h2 id="creator-feature-reels-title">{copy.title}</h2>
            </div>
            <p>{copy.intro}</p>
          </header>
        ) : null}

        <div className="creator-feature-reels__stage">
          <div className="creator-feature-reels__tabs" role="tablist" aria-label={copy.choose}>
            {REELS.map((reel, index) => {
              const Icon = reel.icon;
              const selected = reel.id === active.id;
              return (
                <button
                  key={reel.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="creator-feature-reel-panel"
                  onClick={() => setActiveId(reel.id)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Icon size={18} aria-hidden="true" />
                  <strong>{bi((reel.label).ko, (reel.label).en)}</strong>
                </button>
              );
            })}
          </div>

          <div id="creator-feature-reel-panel" className="creator-feature-reels__panel" role="tabpanel">
            <div className="creator-feature-reels__media">
              <AnimatePresence mode="wait" initial={false}>
                <motion.figure
                  key={active.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.985, x: 16 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 1.01, x: -12 }}
                  transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                  style={{ "--reel-position": active.position ?? "center" } as React.CSSProperties}
                >
                  <ReelPicture reel={active} alt={`${copy.visualAlt}: ${bi((active.title).ko, (active.title).en)}`} />
                  <div className="creator-feature-reels__scan" aria-hidden="true" />
                  <figcaption>
                    <span><ActiveIcon size={14} aria-hidden="true" />{bi((active.label).ko, (active.label).en)}</span>
                    <span>TOONSTUDIO · VISUAL WALKTHROUGH</span>
                  </figcaption>
                </motion.figure>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "en", "{v0}-copy"), { v0: String(active.id) })}
                className="creator-feature-reels__copy"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="creator-feature-reels__label">{bi((active.label).ko, (active.label).en)}</p>
                <h3>{bi((active.title).ko, (active.title).en)}</h3>
                <p>{bi((active.body).ko, (active.body).en)}</p>
                <div className="creator-feature-reels__proofs">
                  {bi((active.proof).ko, (active.proof).en).map((proof) => <span key={proof}>{proof}</span>)}
                </div>
                <Link href={active.href} className="creator-feature-reels__action">
                  {bi((active.action).ko, (active.action).en)}<ArrowRight size={17} aria-hidden="true" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="creator-feature-reels__micro-grid" aria-label={copy.choose}>
          {REELS.map((reel) => {
            const Icon = reel.icon;
            return (
              <button key={reel.id} type="button" onClick={() => setActiveId(reel.id)} aria-pressed={active.id === reel.id}>
                <span className="creator-feature-reels__micro-media" aria-hidden="true">
                  <ReelPicture reel={reel} alt="" />
                </span>
                <span className="creator-feature-reels__micro-copy">
                  <Icon size={16} aria-hidden="true" />
                  <strong>{bi((reel.label).ko, (reel.label).en)}</strong>
                </span>
              </button>
            );
          })}
        </div>

        {showFilm ? (
          <section className="creator-feature-reels__film" aria-labelledby="creator-feature-film-title">
          <div className="creator-feature-reels__film-copy">
            <p className="creator-feature-reels__eyebrow"><Play size={14} aria-hidden="true" />{copy.filmEyebrow}</p>
            <h3 id="creator-feature-film-title">{copy.filmTitle}</h3>
            <p>{copy.filmBody}</p>
            <div>
              <button type="button" onClick={() => setFilmMounted((current) => !current)}>
                {filmMounted ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                {filmMounted ? copy.filmPause : copy.filmPlay}
              </button>
              <Link href="/brand-film">{copy.filmOpen}<ArrowRight size={15} aria-hidden="true" /></Link>
              <Link href="/product-tour">{copy.tourOpen}<ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="creator-feature-reels__film-media">
            {filmMounted ? (
              <video
                controls
                autoPlay={!prefersReducedMotion}
                muted
                playsInline
                preload="metadata"
                poster="/brand/toonstudio-film-poster.jpg"
                aria-label={copy.filmTitle}
              >
                <source src="/brand/toonstudio-intro.mp4" type="video/mp4" />
                <track kind="captions" src="/brand/toonstudio-intro.ko.vtt" srcLang="ko" label={translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "ko", "한국어")} default={locale.split("-")[0] === "ko"} />
                <track kind="captions" src="/brand/toonstudio-intro.en.vtt" srcLang="en" label={translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "en", "English")} default={locale.split("-")[0] !== "ko"} />
              </video>
            ) : (
              <button type="button" className="creator-feature-reels__poster" onClick={() => setFilmMounted(true)} aria-label={copy.filmPlay}>
                <img src="/brand/toonstudio-film-poster.jpg" alt="" loading="lazy" decoding="async" />
                <span><Play size={25} fill="currentColor" aria-hidden="true" /></span>
                <small>{translateCurrentStaticSourceText("domains.marketing.CreatorFeatureReels", "en", "REMOTION · 24 SEC · 30 FPS")}</small>
              </button>
            )}
          </div>
        </section>
        ) : null}

        {!embedded ? (
          <footer className="creator-feature-reels__closing">
            <div><h3>{copy.finalTitle}</h3><p>{copy.finalBody}</p></div>
            <Link href="/studio/new">{copy.finalAction}<ArrowRight size={18} aria-hidden="true" /></Link>
          </footer>
        ) : null}
      </div>
    </section>
  );
}
