import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Database,
  Palette,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WifiOff,
  Wrench,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

const TECHNOLOGY_GROUPS = [
  {
    icon: Code2,
    technologies: ["React", "TypeScript", "Vite", "Tailwind CSS"],
    ko: {
      eyebrow: "WEB APPLICATION",
      title: "복잡한 제작 화면을 빠르고 일관되게",
      body: "React와 TypeScript로 화면과 상태의 경계를 명확히 하고, Vite와 Tailwind CSS로 빠른 개발 흐름과 공통 디자인 언어를 유지합니다.",
      benefit: "작업공간이 늘어나도 같은 조작 방식과 시각 규칙을 유지하는 기반입니다.",
    },
    en: {
      eyebrow: "WEB APPLICATION",
      title: "Fast, consistent interfaces for complex production",
      body: "React and TypeScript keep interface and state boundaries explicit, while Vite and Tailwind CSS support a fast build loop and shared visual language.",
      benefit: "The foundation for familiar interaction and visual rules as the workspace grows.",
    },
  },
  {
    icon: Palette,
    technologies: ["CanvasKit / Skia", "WebGPU / WebGL", "Three.js", "Babylon.js"],
    ko: {
      eyebrow: "2D & 3D CREATIVE ENGINES",
      title: "드로잉과 3D 참고 장면을 브라우저 안에서",
      body: "CanvasKit·Skia 계열 렌더링과 GPU 가속 경로를 활용해 2D 표현을 다루고, Three.js와 Babylon.js 생태계로 포즈, 배경, 카메라와 3D 장면을 구성합니다.",
      benefit: "브라우저와 기기 성능에 따라 가능한 경로를 선택하고, 지원되지 않는 기능에는 안전한 대체 경로를 둡니다.",
    },
    en: {
      eyebrow: "2D & 3D CREATIVE ENGINES",
      title: "Drawing and 3D reference scenes inside the browser",
      body: "CanvasKit and Skia-family rendering combine with GPU paths for 2D work, while the Three.js and Babylon.js ecosystems support poses, backgrounds, cameras and 3D scenes.",
      benefit: "The app selects an available path for the browser and device, with safer fallbacks when advanced capabilities are unavailable.",
    },
  },
  {
    icon: WifiOff,
    technologies: ["Service Worker", "OPFS", "IndexedDB", "SQLite WASM"],
    ko: {
      eyebrow: "LOCAL & OFFLINE FOUNDATIONS",
      title: "연결 상태가 달라도 작업을 지키는 기반",
      body: "서비스 워커와 브라우저 로컬 저장 기술을 사용해 설치 가능한 웹 경험, 자동 저장, 복구와 지원 범위 안의 오프라인 작업을 구성합니다.",
      benefit: "오프라인 지원 범위는 작업공간마다 다를 수 있으며, 중요한 원고의 별도 내보내기를 항상 권장합니다.",
    },
    en: {
      eyebrow: "LOCAL & OFFLINE FOUNDATIONS",
      title: "A foundation that protects work across connection states",
      body: "Service workers and browser-local storage support an installable web experience, autosave, recovery and offline work where the active workspace allows it.",
      benefit: "Offline coverage can differ by workspace, and exporting a separate copy of important work is always recommended.",
    },
  },
  {
    icon: UsersRound,
    technologies: ["Yjs", "Realtime transport", "Project revisions", "Role-based handoff"],
    ko: {
      eyebrow: "DATA & COLLABORATION",
      title: "같은 원고를 함께 다룰 때 필요한 질서",
      body: "프로젝트 데이터와 변경 이력을 분리하고, Yjs를 포함한 협업 기반과 실시간 전송 계층을 통해 공동 편집과 역할별 전달을 확장할 수 있도록 설계합니다.",
      benefit: "누가 무엇을 바꿨는지, 어떤 버전을 검토하는지, 다음 담당자가 누구인지 명확하게 만드는 것이 목표입니다.",
    },
    en: {
      eyebrow: "DATA & COLLABORATION",
      title: "Order and clarity when several people touch one work",
      body: "Project data and revisions stay distinct, while collaboration foundations including Yjs and realtime transport allow shared editing and role-based handoff to grow.",
      benefit: "The goal is to make the active version, meaningful changes and next owner understandable.",
    },
  },
  {
    icon: ShieldCheck,
    technologies: ["Vitest", "Playwright", "CSP", "Open-source notices"],
    ko: {
      eyebrow: "QUALITY & TRUST",
      title: "보이는 기능뿐 아니라 실패하는 순간까지 검증",
      body: "단위·통합 테스트와 실제 브라우저 시나리오를 함께 사용하고, 콘텐츠 보안 정책과 오픈소스 고지 절차를 빌드 과정에 포함합니다.",
      benefit: "비용이나 일정 때문에 핵심 검증을 우회하지 않고, 지원되지 않는 상태에서는 실패를 숨기지 않는 방향을 우선합니다.",
    },
    en: {
      eyebrow: "QUALITY & TRUST",
      title: "Testing the visible feature and the moment it fails",
      body: "Unit and integration tests work alongside real-browser scenarios, while content security policy and open-source notices are part of the build process.",
      benefit: "Core validation is not bypassed for cost or schedule, and unsupported states should fail visibly rather than pretend to work.",
    },
  },
] as const;

const TRUST_PRINCIPLES = [
  {
    icon: Database,
    ko: {
      title: "데이터 위치를 이해할 수 있게",
      body: "브라우저, 서비스 저장소 또는 외부 제공자 중 어디에 데이터가 머무는지 기능별 안내를 확장합니다.",
    },
    en: {
      title: "Make data location understandable",
      body: "Product guidance should explain whether data stays in the browser, a service store or an external provider.",
    },
  },
  {
    icon: Sparkles,
    ko: {
      title: "AI는 숨은 필수 조건이 아닌 보조 기능",
      body: "AI가 개입하는 기능을 구분하고, 외부 전송과 개인 키 사용 여부를 사용자가 판단할 수 있게 하는 방향을 따릅니다.",
    },
    en: {
      title: "AI is an assistant, not a hidden requirement",
      body: "AI-assisted features should be identifiable so creators can judge external transfer and personal-key use.",
    },
  },
  {
    icon: Wrench,
    ko: {
      title: "기술 이름보다 사용자 이점부터",
      body: "새 라이브러리를 사용한다는 사실보다 저장 안정성, 조작 반응성, 접근성과 호환성이 어떻게 좋아지는지 먼저 설명합니다.",
    },
    en: {
      title: "Explain user value before technology names",
      body: "Storage safety, responsiveness, accessibility and compatibility matter more than merely listing another library.",
    },
  },
] as const;

export function TechnologyPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const ko = locale === "ko";

  useDocumentTitle(
    ko
      ? "ToonStudio 기술과 신뢰 · 브라우저 작업실의 구성"
      : "ToonStudio technology and trust · Inside the browser studio",
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="TECHNOLOGY · BUILT FOR CREATION"
        title={
          ko
            ? "기술은 창작자의 흐름을 방해하지 않을 때 가치가 있습니다."
            : "Technology matters when it stays out of the creator's way."
        }
        description={
          ko
            ? "ToonStudio를 구성하는 웹, 2D·3D, 로컬 저장, 협업과 품질 기술을 사용자에게 어떤 이점을 주는지 중심으로 소개합니다."
            : "Explore ToonStudio's web, 2D and 3D, local storage, collaboration and quality foundations through the value they provide to creators."
        }
        image="materials"
        imageAlt={
          ko
            ? "브러시와 색상, 레이어, 3D 형태와 코드 요소가 하나의 창작 작업대로 모이는 일러스트"
            : "Illustration bringing brushes, color, layers, 3D forms and code elements into one creative workbench"
        }
        caption={
          ko
            ? "WEB · CANVAS · 3D · LOCAL DATA · QUALITY · 창작을 위한 기술 구성"
            : "WEB · CANVAS · 3D · LOCAL DATA · QUALITY · Technology for creation"
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/studio/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {ko ? "작업실 직접 사용하기" : "Use the studio"}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/about/data"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <Database size={16} aria-hidden="true" />
            {ko ? "데이터 출처 보기" : "Review data sources"}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />

      <section className="py-14 sm:py-20" aria-labelledby="technology-map-title">
        <div className="grid gap-8 md:grid-cols-[0.72fr_1.28fr] md:gap-14">
          <div>
            <p className="eyebrow text-accent">TECHNOLOGY MAP</p>
            <h2
              id="technology-map-title"
              className="mt-4 max-w-md text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {ko
                ? "한 가지 엔진이 아니라, 목적에 맞는 여러 층으로 구성합니다."
                : "Not one engine, but several layers chosen for the job."}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-fg-2">
              {ko
                ? "화면 구성, 2D·3D 표현, 로컬 데이터, 협업과 검증은 서로 다른 문제입니다. 각 층을 분리해 한 기능의 실패가 전체 작업을 무너뜨리지 않도록 설계합니다."
                : "Interface, 2D and 3D rendering, local data, collaboration and validation are different problems. Separating them limits how far one failure can spread."}
            </p>
          </div>

          <div className="space-y-4">
            {TECHNOLOGY_GROUPS.map((group) => {
              const Icon = group.icon;
              const copy = group[locale];

              return (
                <article
                  key={copy.title}
                  className="rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                      <Icon size={23} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">
                        {copy.eyebrow}
                      </p>
                      <h3 className="mt-2 text-balance text-xl font-bold tracking-tight text-fg">
                        {copy.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-fg-2">{copy.body}</p>

                      <div
                        className="mt-5 flex flex-wrap gap-2"
                        aria-label={ko ? "관련 기술" : "Related technologies"}
                      >
                        {group.technologies.map((technology) => (
                          <span
                            key={technology}
                            className="rounded-full border border-line bg-card/75 px-3 py-1.5 font-display text-[0.68rem] font-semibold text-fg-2"
                          >
                            {technology}
                          </span>
                        ))}
                      </div>

                      <p className="mt-5 flex items-start gap-2 rounded-2xl border border-line/60 bg-card/55 px-4 py-3 text-xs leading-6 text-fg-2">
                        <CheckCircle2
                          size={15}
                          className="mt-1 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <span>{copy.benefit}</span>
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="technology-trust-title">
        <p className="eyebrow text-accent">TRUST PRINCIPLES</p>
        <h2
          id="technology-trust-title"
          className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
        >
          {ko ? "기술 소개가 신뢰 안내가 되도록." : "Technology documentation should also explain trust."}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
          {ko
            ? "서버 이름과 라이브러리 목록을 나열하는 데서 끝내지 않고, 데이터와 외부 연결, 실패와 대체 경로를 사용자가 이해할 수 있는 언어로 설명합니다."
            : "The goal is not only to list servers and libraries, but to explain data, external connections, failure and fallback paths in language creators can understand."}
        </p>

        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {TRUST_PRINCIPLES.map((principle) => {
            const Icon = principle.icon;
            const copy = principle[locale];

            return (
              <article
                key={copy.title}
                className="rounded-3xl border border-line/70 bg-card/65 p-6"
              >
                <Icon size={22} className="text-accent" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold text-fg">{copy.title}</h3>
                <p className="mt-3 text-sm leading-7 text-fg-2">{copy.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="mt-14 rounded-[2rem] border border-line/70 bg-panel/65 p-6 shadow-sm sm:p-8 lg:p-10"
        aria-labelledby="technology-transparency-title"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <ShieldCheck size={24} className="text-accent" aria-hidden="true" />
            <p className="mt-5 eyebrow text-accent">TRANSPARENCY, NOT INTERNAL EXPOSURE</p>
            <h2
              id="technology-transparency-title"
              className="mt-3 text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {ko
                ? "사용자에게 필요한 정보는 공개하고, 공격에 도움이 되는 운영 정보는 보호합니다."
                : "Share what users need while protecting operational detail that could enable abuse."}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
              {ko
                ? "데이터 처리 목적, 외부 제공자 사용 여부, 오픈소스 라이선스와 지원 범위는 설명합니다. API 키, 비공개 엔드포인트, 서버 접속 정보와 상세 보안 설정은 기술 소개에 노출하지 않습니다."
                : "Data purpose, external providers, open-source licenses and support scope should be documented. API keys, private endpoints, server access and sensitive security configuration should not be exposed."
              }
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
            >
              {ko ? "개인정보 안내" : "Privacy"}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/copyright"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
            >
              {ko ? "저작권·오픈소스" : "Copyright & open source"}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </Container>
  );
}
