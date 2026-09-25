import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Database,
  Film,
  Gauge,
  GraduationCap,
  Layers3,
  LibraryBig,
  NotebookTabs,
  Presentation,
  Scale,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";
import {
  ENGINEERING_STATUS_META,
  type EngineeringStatus,
} from "./technology/engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS as ENGINEERING_CHAPTERS } from "./technology/engineering-story-published-content";
import {
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./technology/EngineeringStoryUi";
import { useEngineeringLocale } from "./technology/use-engineering-locale";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("TechnologyPage", ko, en);

const ARCHITECTURE_LAYERS = [
  {
    icon: Sparkles,
    title: { ko: "창작 경험", en: "Creative experience" },
    body: {
      ko: "기획·회차·컷·드로잉·3D·검수·연재",
      en: "Planning, episodes, cuts, drawing, 3D, review and release",
    },
  },
  {
    icon: Layers3,
    title: { ko: "도메인 계약", en: "Domain contracts" },
    body: {
      ko: "프로젝트·자산·revision·승인·게시 기록",
      en: "Projects, assets, revisions, approvals and publishing records",
    },
  },
  {
    icon: Gauge,
    title: { ko: "전문 엔진", en: "Specialist engines" },
    body: {
      ko: "Canvas·WebGPU·WASM·3D·협업·AI 어댑터",
      en: "Canvas, WebGPU, WASM, 3D, collaboration and AI adapters",
    },
  },
  {
    icon: Database,
    title: { ko: "데이터와 인프라", en: "Data and infrastructure" },
    body: {
      ko: "OPFS·SQLite·개인 클라우드·API·실시간·원장",
      en: "OPFS, SQLite, personal cloud, APIs, realtime and ledger data",
    },
  },
  {
    icon: ShieldCheck,
    title: { ko: "검증과 신뢰", en: "Verification and trust" },
    body: {
      ko: "테스트·성능 예산·CSP·라이선스·출처",
      en: "Tests, performance budgets, CSP, licenses and provenance",
    },
  },
] as const;

const HUB_LINKS = [
  {
    href: "/about/technology/story",
    icon: BookOpen,
    title: { ko: "전체 제작 스토리", en: "Full engineering story" },
    body: {
      ko: "문제, 선택, 포기한 대안, 사용자 가치와 실제 근거를 30개 챕터로 확인합니다.",
      en: "Explore problems, decisions, rejected alternatives, user value and evidence across 30 chapters.",
    },
  },
  {
    href: "/about/technology/playbook",
    icon: GraduationCap,
    title: { ko: "서비스·시장·세미나 플레이북", en: "Service, market and seminar playbook" },
    body: {
      ko: "서비스 소개, 시장 벤치마크, 기술 도시어, AI 작업 방식, 홍보영상과 120분 세미나를 한 흐름으로 연결합니다.",
      en: "Connect service positioning, market benchmarks, technical dossiers, AI workflows, promotional film and a 120-minute seminar.",
    },
  },
  {
    href: "/about/technology/guides",
    icon: Wrench,
    title: { ko: "다른 프로젝트에 적용", en: "Apply it elsewhere" },
    body: {
      ko: "OAuth, 클라우드 저장, 브러시, 성능, 크롤링, QA, 인프라와 AI 가이드를 제공합니다.",
      en: "Use implementation guides for OAuth, cloud storage, brushes, performance, acquisition, QA, infrastructure and AI.",
    },
  },
  {
    href: "/about/technology/references",
    icon: LibraryBig,
    title: { ko: "참고 자료와 장애 기록", en: "References and troubleshooting" },
    body: {
      ko: "실제 사용·평가·제품 참고를 구분하고 PWA, Worker, 3D, AI와 Open API 장애 해결 과정을 확인합니다.",
      en: "Separate used, evaluated and product-reference material and inspect PWA, Worker, 3D, AI and Open API incident records.",
    },
  },
  {
    href: "/about/technology/field-notes",
    icon: NotebookTabs,
    title: { ko: "기술 심화 노트", en: "Engineering field notes" },
    body: {
      ko: "Worker·PWA·무료 AI·인프라·Blender MCP·3D·Open API와 장애 해결 사례를 살펴봅니다.",
      en: "Study workers, PWA, free-first AI and infrastructure, Blender MCP, 3D, Open APIs and troubleshooting.",
    },
  },
  {
    href: "/about/technology/deck",
    icon: Presentation,
    title: { ko: "웹 프레젠테이션", en: "Web presentation" },
    body: {
      ko: "투자자·기술 세미나·스터디 대상에 맞춰 같은 사실을 다른 깊이로 발표합니다.",
      en: "Present the same facts at investor, seminar or study depth.",
    },
  },
  {
    href: "/about/technology/videos",
    icon: Film,
    title: { ko: "Remotion 영상", en: "Remotion film" },
    body: {
      ko: "90초 개요, 45초 투자자용과 세로형 컴포지션을 검토 가능한 artifact로 렌더링합니다.",
      en: "Render 90-second, 45-second investor and portrait compositions as reviewable artifacts.",
    },
  },
  {
    href: "/about/technology/licenses",
    icon: Scale,
    title: { ko: "오픈소스와 권리", en: "Open source and rights" },
    body: {
      ko: "코드, 폰트, 이미지, 3D, AI 모델과 생성 결과의 권리를 각각 확인합니다.",
      en: "Review rights for code, fonts, images, 3D, AI models and generated output separately.",
    },
  },
] as const;

const FEATURED_CHAPTER_IDS = new Set([
  "architecture",
  "authentication",
  "social-identity-lifecycle",
  "share-distribution-boundary",
  "storage",
  "brush-engine",
  "brush-render-authority",
  "collaborative-crdt-boundary",
  "quality",
  "ai-routing",
  "worker-architecture",
  "pwa-continuity",
  "web-3d-engine",
  "virtual-studio-world-authority",
  "free-ai-routing",
]);

export function TechnologyPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();

  const featuredChapters = ENGINEERING_CHAPTERS.filter((chapter) => FEATURED_CHAPTER_IDS.has(chapter.id));
  const statusCounts = ENGINEERING_CHAPTERS.reduce<Record<EngineeringStatus, number>>(
    (counts, chapter) => ({ ...counts, [chapter.status]: counts[chapter.status] + 1 }),
    {
      live: 0,
      configured: 0,
      experimental: 0,
      documented: 0,
      planned: 0,
      retired: 0,
      "reference-only": 0,
    },
  );

  useDocumentTitle(
    bi("ToonStudio Engineering Story · 브라우저 제작실을 만든 과정", "ToonStudio Engineering Story · How the browser studio was built"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="TOONSTUDIO ENGINEERING STORY"
        title={
          bi("브라우저에서 웹툰 제작 스튜디오를 만들기까지.", "How we built a webtoon production studio in the browser.")
        }
        description={
          bi("어떤 기술을 사용했는지뿐 아니라 왜 선택했는지, 실제로 어디까지 동작하는지, 실패와 대체 경로는 무엇인지, 다른 서비스에는 어떻게 적용할 수 있는지까지 공개합니다.", "Not only what we used, but why, how far it really works, what fails, which fallback remains and how to reuse the approach elsewhere.")
        }
        image="materials"
        imageAlt={
          bi("브러시와 코드, 데이터, 3D, 테스트 요소가 하나의 제작 흐름으로 연결되는 기술 일러스트", "Engineering illustration connecting brushes, code, data, 3D and tests into one production flow")
        }
        caption={
          bi("WEB · CANVAS · STORAGE · COLLABORATION · AI · DELIVERY", "WEB · CANVAS · STORAGE · COLLABORATION · AI · DELIVERY")
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/about/technology/story"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {bi("전체 제작 과정 보기", "Read the full story")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/about/technology/playbook"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <GraduationCap size={16} aria-hidden="true" />
            {bi("기술 플레이북", "Engineering playbook")}
          </Link>
          <Link
            href="/about/technology/deck"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <Presentation size={16} aria-hidden="true" />
            {bi("발표 모드 열기", "Open presentation mode")}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />
      <EngineeringStoryNav className="mt-3" />

      <section className="py-14 sm:py-20" aria-labelledby="engineering-status-title">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.TechnologyPage", "en", "VERIFIED STATUS")}</p>
            <h2
              id="engineering-status-title"
              className="mt-4 max-w-lg text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {bi("코드가 있다는 이유만으로 운영 기능이라고 부르지 않습니다.", "Code existence alone does not make a capability live.")}
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-fg-2">
              {bi("모든 공개 항목을 운영 경로, 설정 완료, 실험, 문서화와 설계 단계로 구분하고 코드·테스트·워크플로·문서를 근거로 연결합니다.", "Every public claim is labelled as live, configured, experimental, documented or planned and connected to code, tests, workflows or documents.")
              }
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(["live", "configured", "experimental", "documented"] as const).map((status) => (
              <article key={status} className="rounded-3xl border border-line/70 bg-card/65 p-5">
                <EngineeringStatusBadge status={status} locale={locale} />
                <p className="mt-5 font-display text-3xl font-black tracking-tight text-fg">
                  {statusCounts[status]}
                </p>
                <p className="mt-2 text-xs leading-6 text-fg-3">
                  {bi((ENGINEERING_STATUS_META[status].description).ko, (ENGINEERING_STATUS_META[status].description).en)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="engineering-architecture-title">
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.TechnologyPage", "en", "ARCHITECTURE MAP")}</p>
            <h2
              id="engineering-architecture-title"
              className="mt-3 text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {bi("한 엔진이 아니라, 실패 범위를 제한하는 다섯 개 층.", "Not one engine, but five layers that limit failure scope.")}
            </h2>
          </div>
          <Boxes size={28} className="hidden text-accent sm:block" aria-hidden="true" />
        </div>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-line/70 bg-panel/65 p-4 shadow-sm sm:p-6">
          <ol className="grid gap-3 lg:grid-cols-5" aria-label={bi("기술 아키텍처 계층", "Engineering architecture layers")}>
            {ARCHITECTURE_LAYERS.map((layer, index) => {
              const Icon = layer.icon;
              return (
                <li key={layer.title.ko} className="relative rounded-3xl border border-line/70 bg-card/75 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className="font-display text-[0.66rem] font-black text-fg-3">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-fg">{bi((layer.title).ko, (layer.title).en)}</h3>
                  <p className="mt-2 text-xs leading-6 text-fg-3">{bi((layer.body).ko, (layer.body).en)}</p>
                  {index < ARCHITECTURE_LAYERS.length - 1 ? (
                    <ArrowRight
                      size={16}
                      className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-page text-accent lg:block"
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="engineering-hub-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.TechnologyPage", "en", "REUSE THE STORY")}</p>
        <h2 id="engineering-hub-title" className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {bi("하나의 기술 원본을 여덟 가지 방식으로 사용합니다.", "Use one engineering source in eight different ways.")}
        </h2>
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {HUB_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-64 flex-col rounded-3xl border border-line/70 bg-card/65 p-5 transition-all hover:-translate-y-1 hover:border-accent/45 hover:bg-raised hover:shadow-lg motion-reduce:transform-none"
              >
                <span className="grid size-11 place-items-center rounded-2xl border border-line bg-panel text-fg-2 transition-colors group-hover:border-accent/30 group-hover:bg-accent-soft group-hover:text-accent">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-6 text-lg font-bold text-fg">{bi((item.title).ko, (item.title).en)}</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-fg-3">{bi((item.body).ko, (item.body).en)}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-accent">
                  {bi("열기", "Open")}
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="engineering-featured-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.TechnologyPage", "en", "CORE DECISIONS")}</p>
        <h2 id="engineering-featured-title" className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {bi("ToonStudio를 지탱하는 핵심 기술 의사결정", "Core engineering decisions behind ToonStudio")}
        </h2>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {featuredChapters.map((chapter) => (
            <article key={chapter.id} className="rounded-[2rem] border border-line/70 bg-panel/55 p-6 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-[0.66rem] font-black uppercase tracking-[0.16em] text-accent">
                  {chapter.eyebrow}
                </p>
                <EngineeringStatusBadge status={chapter.status} locale={locale} />
              </div>
              <h3 className="mt-5 text-balance text-xl font-bold tracking-tight text-fg">{bi((chapter.title).ko, (chapter.title).en)}</h3>
              <p className="mt-3 text-sm leading-7 text-fg-2">{bi((chapter.thesis).ko, (chapter.thesis).en)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {chapter.technologies.slice(0, 4).map((technology) => (
                  <span key={technology} className="rounded-full border border-line bg-card px-3 py-1.5 text-[0.68rem] font-semibold text-fg-3">
                    {technology}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="mt-14 rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm sm:p-8 lg:p-10"
        aria-labelledby="engineering-transparency-title"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <ShieldCheck size={24} className="text-accent" aria-hidden="true" />
            <p className="mt-5 eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.TechnologyPage", "en", "TRANSPARENCY WITHOUT SECRET EXPOSURE")}</p>
            <h2 id="engineering-transparency-title" className="mt-3 max-w-3xl text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {bi("판단에 필요한 근거는 공개하고, 공격에 도움이 되는 운영 비밀은 보호합니다.", "Publish evidence needed for judgment while protecting operational secrets.")}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
              {bi("데이터 위치, 외부 공급자, 지원 범위, 오픈소스와 실패 경로는 설명합니다. API 키, 비공개 엔드포인트, 실제 계정 식별자와 상세 서버 접근 정보는 예제와 자료에 포함하지 않습니다.", "Data location, external providers, support scope, open source and failure paths are explained. API keys, private endpoints, real account identifiers and server access details are excluded.")
              }
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
            <Link
              href="/about/technology/licenses"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
            >
              <Scale size={15} aria-hidden="true" />
              {bi("라이선스 확인", "Review licenses")}
            </Link>
            <Link
              href="/about/data"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
            >
              <Database size={15} aria-hidden="true" />
              {bi("데이터 출처", "Data sources")}
            </Link>
          </div>
        </div>
      </section>
    </Container>
  );
}
