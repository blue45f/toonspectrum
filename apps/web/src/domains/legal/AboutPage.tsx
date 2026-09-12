import { ArrowRight, BookOpen, Brush, Layers, MessageSquare, ShieldCheck } from "lucide-react";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

const FEATURES = [
  { icon: Brush, ko: ["이야기에 맞는 선과 색", "펜으로 선을 잡고 브러시로 채색하세요. 레이어를 나누어 수정하면서 장면의 분위기를 만들어 갑니다."], en: ["Lines and color that tell your story", "Ink with a pen, paint with brushes and refine the atmosphere across separate layers."] },
  { icon: Layers, ko: ["컷에서 완성 원고까지", "캔버스와 레이어, 말풍선을 함께 다루며 웹툰의 흐름을 구성하세요. 완성한 작업은 내보내기로 이어집니다."], en: ["From panels to a finished page", "Build your webtoon with canvases, layers and speech balloons, then export the finished work."] },
  { icon: MessageSquare, ko: ["참고하고, 만들고, 나누기", "작품 탐색으로 연출을 살피고, 참고자료와 창작 리소스를 찾아보세요. 갤러리와 커뮤니티에서 다음 이야기를 이어갑니다."], en: ["Reference, create and share", "Study visual storytelling, explore references and creative resources, then continue the conversation in the gallery and community."] },
] as const;

const STEPS = [
  { href: "/research", ko: ["장면의 단서를 모으세요", "구도와 분위기를 참고하고, 출처와 사용 조건을 함께 확인하세요.", "참고자료 둘러보기"], en: ["Gather the clues for your scene", "Explore composition and atmosphere, keeping sources and usage conditions in view.", "Explore references"] },
  { href: "/make", ko: ["첫 컷을 직접 그리세요", "웹툰·컷툰·일러스트 중 만들고 싶은 작업을 고르고 시작하세요.", "작업 시작하기"], en: ["Draw your first panel", "Choose the webtoon, short comic or illustration you want to make.", "Start creating"] },
  { href: "/showcase", ko: ["완성한 이야기를 연결하세요", "다른 창작자의 작품을 보고, 내 작품을 나눌 공간을 찾아보세요.", "갤러리 둘러보기"], en: ["Connect your finished story", "Discover other creators and find a place to share your own work.", "Explore the gallery"] },
] as const;

export function AboutPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const ko = locale === "ko";
  useDocumentTitle(ko ? "ToonStudio 소개 · 웹툰을 그리는 작업실" : "About ToonStudio · A webtoon drawing atelier");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="ABOUT · THE WEBTOON ATELIER"
        title={ko ? "웹툰을 그리는 전문 작업실." : "A drawing atelier built for webtoons."}
        description={ko ? "한 컷의 선, 장면의 색, 이야기를 잇는 말풍선. ToonStudio는 브라우저에서 웹툰과 일러스트를 만들고, 다시 열어 다듬고, 완성한 작업을 내보내는 드로잉 도구입니다." : "The line of a panel, the color of a scene, the words that connect them. ToonStudio brings webtoon drawing, illustration, revision and export to your browser."}
        image="process"
        imageAlt={ko ? "스케치와 잉크 선, 채색으로 웹툰 장면을 완성하는 과정을 표현한 일러스트" : "Illustration of a webtoon scene developing from sketch through ink to color"}
        caption={ko ? "SKETCH → INK → COLOR · 웹툰 제작 과정 콘셉트 아트" : "SKETCH → INK → COLOR · Webtoon process concept art"}
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/make" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">{ko ? "첫 컷 그리기" : "Draw your first panel"}<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/learn" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"><BookOpen size={16} aria-hidden="true" />{ko ? "작업 흐름 알아보기" : "Learn the workflow"}</Link>
        </div>
      </PublicStoryHero>

      <section className="py-14 sm:py-20" aria-labelledby="about-drawing-title">
        <div className="grid gap-6 md:grid-cols-[0.7fr_1.3fr] md:gap-14">
          <div><p className="eyebrow text-accent">MADE FOR YOUR STORY</p><h2 id="about-drawing-title" className="mt-4 max-w-sm text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl">{ko ? "선과 장면, 이야기에 집중하세요." : "Keep your attention on the story."}</h2></div>
          <div className="space-y-7">{FEATURES.map(({ icon: Icon, ...feature }) => { const [title, body] = feature[locale]; return <div key={title} className="flex gap-5 border-b border-line pb-7"><Icon size={22} className="mt-1 shrink-0 text-accent" aria-hidden="true" /><div><h3 className="text-lg font-bold text-fg">{title}</h3><p className="mt-2 text-sm leading-7 text-fg-2">{body}</p></div></div>; })}</div>
        </div>
      </section>

      <section aria-labelledby="about-journey-title">
        <p className="eyebrow text-accent">A CONNECTED CREATIVE PRACTICE</p>
        <h2 id="about-journey-title" className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">{ko ? "영감부터 당신의 첫 작품까지." : "From inspiration to your first work."}</h2>
        <div className="mt-7 grid gap-x-8 md:grid-cols-3">{STEPS.map((step, index) => { const [title, body, cta] = step[locale]; return <Link key={step.href} href={step.href} className="public-story-route group"><span className="public-story-route__index" aria-hidden="true">0{index + 1}</span><div><h3 className="font-bold text-fg">{title}</h3><p className="mt-3 text-sm leading-7 text-fg-2">{body}</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-accent">{cta}<ArrowRight size={14} aria-hidden="true" /></span></div></Link>; })}</div>
      </section>

      <section className="mt-12 grid gap-7 border-y border-line bg-panel/45 px-6 py-8 md:grid-cols-2 sm:px-8" aria-label={ko ? "제품의 약속과 데이터 안내" : "Product commitments and data"}>
        <div><ShieldCheck size={22} className="text-accent" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-fg">{ko ? "작업을 지키는 습관까지." : "A practice that protects your work."}</h2><p className="mt-3 text-sm leading-7 text-fg-2">{ko ? "로컬 저장과 문서 복구를 제공하며, 중요한 작업은 파일로도 내보내 보관하세요. 브라우저 데이터 삭제와 기기 변경에 대비하는 방법을 도움말에서 확인할 수 있습니다." : "Use local saving and document recovery, and keep an exported copy of important work. Our help center explains how to prepare for clearing browser data or moving to another device."}</p><Link href="/help" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">{ko ? "저장·복구 도움말" : "Saving and recovery help"}<ArrowRight size={14} aria-hidden="true" /></Link></div>
        <div><BookOpen size={22} className="text-accent" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-fg">{ko ? "읽는 경험도, 창작의 일부." : "Reading is part of creating."}</h2><p className="mt-3 text-sm leading-7 text-fg-2">{ko ? "ToonSpectrum의 작품 검색, 제공처 비교, 랭킹과 리뷰로 다음 이야기를 발견하세요. 작품 정보의 출처와 갱신 상태, 추정 지표를 구분해 안내합니다. 외부 플랫폼의 유료 본문과 회차 이미지는 제공하지 않습니다." : "Discover your next story through ToonSpectrum search, platform comparisons, rankings and reviews. Sources, update status and estimates are distinguished. Paid chapters and episode images from external platforms are not hosted here."}</p><Link href="/discover" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">{ko ? "작품 탐색하기" : "Discover stories"}<ArrowRight size={14} aria-hidden="true" /></Link></div>
      </section>
    </Container>
  );
}
