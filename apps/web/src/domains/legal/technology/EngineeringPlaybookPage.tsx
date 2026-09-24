import {
  ArrowRight,
  Bot,
  Boxes,
  Brush,
  CheckCircle2,
  Cuboid,
  Database,
  Film,
  Gauge,
  Globe2,
  GraduationCap,
  Layers3,
  LibraryBig,
  Presentation,
  Share2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_AI_WORKBENCH,
  ENGINEERING_BENCHMARK_GROUPS,
  ENGINEERING_FILM_CUTS,
  ENGINEERING_PLAYBOOK_DOSSIERS,
  ENGINEERING_PLAYBOOK_PRINCIPLES,
  ENGINEERING_REUSE_BLUEPRINTS,
  ENGINEERING_SEMINAR_MODULES,
} from "./engineering-playbook-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { ServiceStoryJourney } from "@/shared/components/service-story-journey";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringPlaybookPage", ko, en);

const DOSSIER_ICONS: Record<string, LucideIcon> = {
  "service-product-architecture": Layers3,
  "identity-sharing-growth": Share2,
  "brush-rendering-system": Brush,
  "crdt-collaboration": UsersRound,
  "workers-native-like-performance": Gauge,
  "virtual-studio-living-world": Globe2,
  "multi-engine-3d-dcc": Cuboid,
  "ai-assisted-product-engineering": Bot,
  "data-crawling-provenance": Database,
  "quality-delivery-promotion": ShieldCheck,
};

const SECTION_LINKS = [
  { href: "#principles", icon: ShieldCheck, ko: "설계 원칙", en: "Principles" },
  { href: "#dossiers", icon: Layers3, ko: "기술 도시어", en: "Dossiers" },
  { href: "#benchmarks", icon: LibraryBig, ko: "시장 벤치마크", en: "Benchmarks" },
  { href: "#ai-workbench", icon: Bot, ko: "AI 작업 방식", en: "AI workbench" },
  { href: "#film", icon: Film, ko: "홍보영상", en: "Film" },
  { href: "#seminar", icon: GraduationCap, ko: "세미나", en: "Seminar" },
  { href: "#reuse", icon: Workflow, ko: "재사용 청사진", en: "Reuse" },
] as const;

export function EngineeringPlaybookPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const seminarModules = ENGINEERING_SEMINAR_MODULES.length;

  useDocumentTitle(
    bi(
      "ToonStudio 기술 플레이북 · 서비스 소개, 벤치마크와 세미나",
      "ToonStudio engineering playbook · Service story, benchmarks and seminar",
    ),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="ENGINEERING PLAYBOOK · SERVICE · MARKET · SEMINAR"
        title={bi(
          "무엇을 만들었는지보다, 왜 이 경계를 선택했고 어떻게 검증했는지까지.",
          "Not only what was built, but why each boundary exists and how it is verified.",
        )}
        description={bi(
          "서비스 소개, 소셜 로그인과 공유, 브러시·CRDT·Worker·PWA·가상 스튜디오·3D·AI·크롤링의 기술 배경을 시장 벤치마크, 홍보영상 구성, 세미나 커리큘럼과 다른 프로젝트 적용 순서로 연결했습니다.",
          "Service positioning, identity and sharing, brushes, CRDT, Workers, PWA, virtual studio, 3D, AI and data acquisition are connected to market benchmarks, film treatments, a seminar curriculum and reusable implementation sequences.",
        )}
        aside={
          <div className="grid grid-cols-2 gap-3 rounded-3xl border border-line/70 bg-card/70 p-4">
            {[
              {
                value: ENGINEERING_PLAYBOOK_DOSSIERS.length,
                ko: "기술 도시어",
                en: "dossiers",
              },
              {
                value: ENGINEERING_BENCHMARK_GROUPS.length,
                ko: "벤치마크군",
                en: "benchmark groups",
              },
              {
                value: ENGINEERING_FILM_CUTS.length,
                ko: "영상 컷",
                en: "film cuts",
              },
              {
                value: seminarModules,
                ko: "발표 모듈",
                en: "talk modules",
              },
            ].map((stat) => (
              <div key={stat.ko} className="rounded-2xl border border-line/60 bg-panel/70 p-3">
                <p className="font-display text-2xl font-black text-fg">{stat.value}</p>
                <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-fg-3">
                  {bi((stat).ko, (stat).en)}
                </p>
              </div>
            ))}
          </div>
        }
      />

      <ServiceStoryJourney current="playbook" className="mb-5" />

      <nav
        aria-label={bi("기술 플레이북 목차", "Engineering playbook sections")}
        className="sticky top-3 z-20 rounded-3xl border border-line/70 bg-page/90 p-2 shadow-lg backdrop-blur-xl"
      >
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {SECTION_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:bg-raised hover:text-accent"
              >
                <Icon size={15} aria-hidden="true" />
                {bi((item).ko, (item).en)}
              </a>
            );
          })}
        </div>
      </nav>

      <section id="principles" className="scroll-mt-32 py-14 sm:py-20" aria-labelledby="playbook-principles-title">
        <p className="eyebrow text-accent">{bi("DESIGN PRINCIPLES", "DESIGN PRINCIPLES")}</p>
        <h2 id="playbook-principles-title" className="mt-3 max-w-3xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
          {bi("패키지 선택보다 먼저 고정한 다섯 가지 원칙", "Five principles fixed before package selection")}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
          {bi(
            "이 원칙은 브러시·협업·3D·AI처럼 구현 방식이 크게 다른 기능에도 동일하게 적용됩니다. 기술 이름이 바뀌어도 데이터 권위와 검증 순서는 유지됩니다.",
            "The same principles apply across very different capabilities such as brushes, collaboration, 3D and AI. Data authority and verification order survive technology replacement.",
          )}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ENGINEERING_PLAYBOOK_PRINCIPLES.map((principle, index) => (
            <article key={principle.id} className="rounded-3xl border border-line/70 bg-card/65 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <ShieldCheck size={18} aria-hidden="true" />
                </span>
                <span className="font-display text-xs font-black text-fg-3">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-base font-black text-fg">{bi((principle.title).ko, (principle.title).en)}</h3>
              <p className="mt-3 text-xs leading-6 text-fg-3">{bi((principle.body).ko, (principle.body).en)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="dossiers" className="scroll-mt-32" aria-labelledby="playbook-dossiers-title">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-accent">TECHNICAL DOSSIERS</p>
            <h2 id="playbook-dossiers-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {bi("서비스를 구성하며 해결한 열 가지 기술 문제", "Ten engineering problems behind the service")}
            </h2>
          </div>
          <Link
            href="/about/technology/story"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
          >
            {bi("전체 기술 챕터", "All engineering chapters")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-8 space-y-5">
          {ENGINEERING_PLAYBOOK_DOSSIERS.map((dossier, index) => {
            const Icon = DOSSIER_ICONS[dossier.id] ?? Boxes;
            return (
              <article
                key={dossier.id}
                id={`dossier-${dossier.id}`}
                className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7 lg:p-8"
              >
                <div className="grid gap-7 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="grid size-12 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <EngineeringStatusBadge status={dossier.status} locale={locale} />
                    </div>
                    <p className="mt-6 font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
                      {String(index + 1).padStart(2, "0")} · {dossier.eyebrow.split(" · ").slice(1).join(" · ")}
                    </p>
                    <h3 className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
                      {bi((dossier.title).ko, (dossier.title).en)}
                    </h3>
                    <p className="mt-5 rounded-3xl border border-warning/25 bg-warning-soft/15 p-5 text-sm font-bold leading-7 text-fg-2">
                      {bi((dossier.question).ko, (dossier.question).en)}
                    </p>
                    <p className="mt-5 text-sm leading-7 text-fg-2">{bi((dossier.background).ko, (dossier.background).en)}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <PlaybookList
                      icon={Workflow}
                      title={bi("구조와 선택", "Architecture and decisions")}
                      items={dossier.architecture.map((item) => bi((item).ko, (item).en))}
                    />
                    <PlaybookList
                      icon={CheckCircle2}
                      title={bi("기술적 성과", "Engineering achievements")}
                      items={dossier.achievements.map((item) => bi((item).ko, (item).en))}
                    />
                    <PlaybookList
                      icon={Sparkles}
                      title={bi("다른 서비스에 적용", "Apply elsewhere")}
                      items={dossier.portability.map((item) => bi((item).ko, (item).en))}
                    />
                    <PlaybookList
                      icon={ShieldCheck}
                      title={bi("한계와 금지된 주장", "Limits and prohibited claims")}
                      items={dossier.limits.map((item) => bi((item).ko, (item).en))}
                    />
                  </div>
                </div>

                <details className="group mt-6 rounded-3xl border border-line/70 bg-card/50 open:bg-card/75">
                  <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm font-bold text-fg marker:hidden">
                    <span className="flex items-center gap-2">
                      <LibraryBig size={16} className="text-accent" aria-hidden="true" />
                      {bi("확인 가능한 코드·문서 근거", "Inspectable code and document evidence")}
                    </span>
                    <ArrowRight size={15} className="text-accent transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <ul className="grid gap-2 border-t border-line/70 p-4 md:grid-cols-2">
                    {dossier.evidence.map((path) => (
                      <li key={path} className="overflow-x-auto rounded-2xl border border-line/60 bg-panel/70 px-4 py-3 font-mono text-[0.68rem] text-fg-3">
                        {path}
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            );
          })}
        </div>
      </section>

      <section id="benchmarks" className="scroll-mt-32 py-14 sm:py-20" aria-labelledby="playbook-benchmark-title">
        <p className="eyebrow text-accent">MARKET & PRODUCT BENCHMARKS</p>
        <h2 id="playbook-benchmark-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
          {bi("경쟁 제품을 기능 체크리스트가 아니라 제품 원칙으로 읽기", "Read competing products as product principles, not feature checklists")}
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi(
            "실제 사용, 제한된 평가, UX 참고와 대안을 구분합니다. 공식 문서에서 확인하지 못한 접근성·암호화·성능을 ‘없음’으로 판정하지 않고, 실제 benchmark 없는 동등성 표현도 사용하지 않습니다.",
            "Used, bounded evaluation, UX inspiration and alternatives remain distinct. Unknown accessibility, encryption or performance is never treated as absence, and parity is never claimed without real benchmarks.",
          )}
        </p>

        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {ENGINEERING_BENCHMARK_GROUPS.map((group) => (
            <article key={group.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-6 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-fg">{bi((group.title).ko, (group.title).en)}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.products.map((product) => (
                      <span key={product} className="rounded-full border border-line bg-panel px-3 py-1.5 text-[0.68rem] font-bold text-fg-2">
                        {product}
                      </span>
                    ))}
                  </div>
                </div>
                <LibraryBig size={22} className="text-accent" aria-hidden="true" />
              </div>
              <p className="mt-5 rounded-3xl bg-raised/70 p-4 text-sm leading-7 text-fg-2">
                {bi((group.marketSignal).ko, (group.marketSignal).en)}
              </p>
              {group.observedPatterns?.length ? (
                <div className="mt-5 rounded-3xl border border-accent/20 bg-accent-soft/15 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-accent">
                    {bi("공식 자료에서 확인한 패턴", "Patterns observed in official material")}
                  </p>
                  <ul className="mt-3 space-y-2 text-xs leading-6 text-fg-2">
                    {group.observedPatterns.map((item) => (
                      <li key={item.ko} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                        <span>{bi((item).ko, (item).en)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <CompactList title={bi("배운 점", "Learned")} items={group.learned.map((item) => bi((item).ko, (item).en))} />
                <CompactList title={bi("적용", "Applied")} items={group.applied.map((item) => bi((item).ko, (item).en))} />
                <CompactList title={bi("주장하지 않음", "Do not claim")} items={group.doNotClaim.map((item) => bi((item).ko, (item).en))} />
              </div>
              {group.evidenceNote ? (
                <p className="mt-5 border-t border-line/70 pt-4 text-[0.7rem] leading-6 text-fg-3">
                  {bi((group.evidenceNote).ko, (group.evidenceNote).en)}
                </p>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Link
            href="/about/technology/references"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {bi("제품별 참고·장애 기록", "Product references and incident records")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section id="ai-workbench" className="scroll-mt-32" aria-labelledby="playbook-ai-title">
        <p className="eyebrow text-accent">AI WORKBENCH</p>
        <h2 id="playbook-ai-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
          {bi("AI를 제품 기능, 로컬 추론, 개발 도구와 조사 과정으로 분리", "Separate AI product capability, local inference, engineering tools and research")}
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi(
            "같은 ‘AI 활용’이라도 사용자 데이터와 비용을 다루는 제품 runtime, 코드 변경을 제안하는 개발 agent, DCC·저장소를 조작하는 tool call은 서로 다른 권한과 완료 기준이 필요합니다.",
            "Product runtime handling user data and cost, coding agents proposing changes and tool calls operating DCC or repositories require different permissions and completion criteria.",
          )}
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {ENGINEERING_AI_WORKBENCH.map((item) => (
            <article key={item.id} className="rounded-3xl border border-line/70 bg-panel/60 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Bot size={18} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-line bg-card px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.08em] text-fg-3">
                  {bi((item.layer).ko, (item.layer).en)}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.tools.map((tool) => (
                  <span key={tool} className="rounded-full bg-raised px-2.5 py-1 text-[0.66rem] font-semibold text-fg-2">
                    {tool}
                  </span>
                ))}
              </div>
              <dl className="mt-5 space-y-4 text-xs leading-6">
                <div>
                  <dt className="font-black text-fg">{bi("활용", "Use")}</dt>
                  <dd className="mt-1 text-fg-3">{bi((item.use).ko, (item.use).en)}</dd>
                </div>
                <div>
                  <dt className="font-black text-fg">{bi("남기는 산출물", "Artifact")}</dt>
                  <dd className="mt-1 text-fg-3">{bi((item.artifact).ko, (item.artifact).en)}</dd>
                </div>
                <div className="rounded-2xl border border-warning/25 bg-warning-soft/15 p-3">
                  <dt className="font-black text-warning">{bi("안전장치", "Guardrail")}</dt>
                  <dd className="mt-1 text-fg-2">{bi((item.guardrail).ko, (item.guardrail).en)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section id="film" className="scroll-mt-32 py-14 sm:py-20" aria-labelledby="playbook-film-title">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow text-accent">PROMOTIONAL FILM TREATMENT</p>
            <h2 id="playbook-film-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {bi("길이만 줄이는 것이 아니라 관객의 질문을 바꾸는 네 가지 영상", "Four films that change the audience question, not only the duration")}
            </h2>
          </div>
          <Link
            href="/about/technology/videos"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
          >
            <Film size={15} aria-hidden="true" />
            {bi("영상 제작 페이지", "Film production page")}
          </Link>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {ENGINEERING_FILM_CUTS.map((cut) => (
            <article key={cut.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-6 shadow-sm sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-3xl font-black text-accent">{cut.duration}</p>
                  <p className="mt-1 text-xs font-bold text-fg-3">{bi((cut.audience).ko, (cut.audience).en)}</p>
                </div>
                <Film size={22} className="text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-lg font-black leading-7 text-fg">{bi((cut.promise).ko, (cut.promise).en)}</h3>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <CompactList title={bi("구성", "Beats")} items={cut.beats.map((item) => bi((item).ko, (item).en))} />
                <CompactList title={bi("증거", "Proof")} items={cut.proof.map((item) => bi((item).ko, (item).en))} />
                <CompactList title={bi("피할 것", "Avoid")} items={cut.avoid.map((item) => bi((item).ko, (item).en))} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="seminar" className="scroll-mt-32" aria-labelledby="playbook-seminar-title">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow text-accent">MODULAR STUDY · TALK</p>
            <h2 id="playbook-seminar-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {bi("필요한 모듈만 골라도 흐름이 이어지는 기술 발표 구성", "A technical talk that stays coherent with only the modules you need")}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
              {bi("표시 시간은 토론과 데모를 포함한 권장 범위일 뿐입니다. 청중과 발표 목적에 맞춰 모듈을 줄이거나 확장하며 정해진 시간을 채우기 위해 내용을 반복하지 않습니다.", "Displayed times are recommendations including discussion and demos. Add or remove modules for the audience and purpose rather than repeating material to fill a fixed duration.")}
            </p>
          </div>
          <Link
            href="/about/technology/deck"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            <Presentation size={15} aria-hidden="true" />
            {bi("발표 모드 열기", "Open presentation mode")}
          </Link>
        </div>

        <ol className="mt-8 space-y-4">
          {ENGINEERING_SEMINAR_MODULES.map((module, index) => (
            <li key={module.id} className="grid gap-5 rounded-3xl border border-line/70 bg-panel/60 p-5 shadow-sm md:grid-cols-[8rem_minmax(0,1fr)] sm:p-6">
              <div className="flex items-center gap-3 md:block">
                <span className="grid size-11 place-items-center rounded-2xl bg-accent text-sm font-black text-on-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-0 font-display text-sm font-black text-fg md:mt-3">
                  {bi(`권장 ${module.minutes}분`, `~${module.minutes} min`)}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-black text-fg">{bi((module.title).ko, (module.title).en)}</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-accent">{bi("학습 목표", "Learning")}</p>
                    <ul className="mt-2 space-y-2 text-xs leading-6 text-fg-3">
                      {module.learning.map((item) => (
                        <li key={item.ko} className="flex gap-2">
                          <CheckCircle2 size={13} className="mt-1 shrink-0 text-success" aria-hidden="true" />
                          {bi((item).ko, (item).en)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-accent">{bi("데모·실습", "Demo")}</p>
                    <p className="mt-2 text-xs leading-6 text-fg-3">{bi((module.demo).ko, (module.demo).en)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-accent">{bi("토론 질문", "Discussion")}</p>
                    <p className="mt-2 rounded-2xl bg-raised/70 p-3 text-xs font-semibold leading-6 text-fg-2">
                      {bi((module.discussion).ko, (module.discussion).en)}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="reuse" className="scroll-mt-32 py-14 sm:py-20" aria-labelledby="playbook-reuse-title">
        <p className="eyebrow text-accent">REUSE BLUEPRINTS</p>
        <h2 id="playbook-reuse-title" className="mt-3 max-w-4xl text-balance text-2xl font-black tracking-tight text-fg sm:text-4xl">
          {bi("다른 웹서비스에 옮길 때의 첫 경계·첫 완료·첫 장애 훈련", "First boundary, first milestone and first failure drill for another product")}
        </h2>
        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {ENGINEERING_REUSE_BLUEPRINTS.map((blueprint) => (
            <article key={blueprint.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-6 shadow-sm">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Workflow size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-black text-fg">{bi((blueprint.title).ko, (blueprint.title).en)}</h3>
              <p className="mt-3 text-sm leading-7 text-fg-3">{bi((blueprint.useWhen).ko, (blueprint.useWhen).en)}</p>
              <dl className="mt-5 space-y-4 text-xs leading-6">
                <DefinitionRow term={bi("첫 경계", "First boundary")} value={bi((blueprint.firstBoundary).ko, (blueprint.firstBoundary).en)} />
                <DefinitionRow term={bi("첫 완료", "First milestone")} value={bi((blueprint.firstMilestone).ko, (blueprint.firstMilestone).en)} />
                <DefinitionRow term={bi("장애 훈련", "Failure drill")} value={bi((blueprint.failureDrill).ko, (blueprint.failureDrill).en)} />
                <DefinitionRow term={bi("완료 증거", "Done evidence")} value={bi((blueprint.doneEvidence).ko, (blueprint.doneEvidence).en)} />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-accent/25 bg-accent-soft/35 p-6 sm:p-8 lg:p-10" aria-labelledby="playbook-next-title">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <GraduationCap size={26} className="text-accent" aria-hidden="true" />
            <h2 id="playbook-next-title" className="mt-5 max-w-3xl text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("읽은 내용을 실제 구현 순서와 발표 자료로 바로 바꾸세요.", "Turn this material directly into implementation order and presentation assets.")}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
              {bi(
                "적용 가이드는 checklist를, 발표 모드는 audience별 deck을, 영상 페이지는 Remotion composition과 review artifact를 제공합니다. 모든 자료는 같은 상태·근거 원본을 사용합니다.",
                "Guides provide checklists, presentation mode provides audience-specific decks and the film page provides Remotion compositions and review artifacts. Every surface shares the same status and evidence source.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
            <Link href="/about/technology/guides" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">
              {bi("적용 가이드", "Implementation guides")}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link href="/about/technology/deck" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent">
              {bi("발표 모드", "Presentation mode")}
              <Presentation size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </Container>
  );
}

function PlaybookList({
  icon: Icon,
  title,
  items,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="rounded-3xl border border-line/65 bg-card/65 p-5">
      <div className="flex items-center gap-2 text-sm font-black text-fg">
        <Icon size={16} className="text-accent" aria-hidden="true" />
        <h4>{title}</h4>
      </div>
      <ul className="mt-4 space-y-3 text-xs leading-6 text-fg-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompactList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section>
      <h4 className="text-xs font-black uppercase tracking-[0.08em] text-accent">{title}</h4>
      <ul className="mt-2 space-y-2 text-xs leading-6 text-fg-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DefinitionRow({ term, value }: { readonly term: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-line/60 bg-panel/65 p-3">
      <dt className="font-black text-accent">{term}</dt>
      <dd className="mt-1 text-fg-3">{value}</dd>
    </div>
  );
}
