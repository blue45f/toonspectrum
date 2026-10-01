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
  Layers3,
  LibraryBig,
  Presentation,
  Share2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  ENGINEERING_AI_WORKBENCH,
  ENGINEERING_BENCHMARK_GROUPS,
  ENGINEERING_PLAYBOOK_DOSSIERS,
  ENGINEERING_PLAYBOOK_PRINCIPLES,
} from "./engineering-playbook-content";
import {
  EngineeringDisclosure,
  EngineeringKeySummary,
  EngineeringLongformLayout,
  EngineeringMetaChip,
  type EngineeringTocGroup,
} from "./EngineeringLongform";
import {
  EngineeringPageFrame,
  EngineeringPageIntro,
  EngineeringStatusBadge,
} from "./EngineeringStoryUi";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import "./engineering-playbook.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringPlaybookPage", ko, en);

const BODY_ID = "engineering-playbook-body";

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

/** 예전 플레이북에 있던 자료는 목적에 맞는 페이지로 옮겼다. 링크로만 이어준다. */
const RELOCATED = [
  {
    href: "/about/technology/guides#blueprints",
    icon: Wrench,
    title: { ko: "재사용 청사진", en: "Reuse blueprints" },
    body: { ko: "다른 서비스에 옮길 때의 첫 경계·첫 완료·장애 훈련은 적용 가이드로 옮겼습니다.", en: "First boundary, first milestone and failure drills now live in the guides." },
  },
  {
    href: "/about/technology/deck",
    icon: Presentation,
    title: { ko: "세미나·워크숍 구성", en: "Seminar and workshop plan" },
    body: { ko: "30분 발표와 워크숍 확장 모듈은 발표 모드에서 한 번에 봅니다.", en: "The 30-minute talk and workshop modules live together in presentation mode." },
  },
  {
    href: "/about/technology/videos#film-treatments",
    icon: Film,
    title: { ko: "영상 트리트먼트", en: "Film treatments" },
    body: { ko: "15초·45초·90초·6분 영상 구성은 영상 페이지로 옮겼습니다.", en: "The 15s, 45s, 90s and 6-minute film plans moved to the video page." },
  },
] as const;

function BulletList({ icon: Icon, title, items }: { readonly icon: LucideIcon; readonly title: string; readonly items: readonly string[] }) {
  return (
    <section className="rounded-3xl border border-line/65 bg-card/65 p-5">
      <h4 className="flex items-center gap-2 text-sm font-black text-fg">
        <Icon size={16} className="text-accent" aria-hidden="true" />
        {title}
      </h4>
      <ul className="mt-3 grid gap-2.5 text-xs leading-6 text-fg-2">
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

function SectionHeading({ id, eyebrow, title, description }: { readonly id: string; readonly eyebrow: string; readonly title: string; readonly description?: string }) {
  return (
    <header className="grid gap-3">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h2 id={id} className="max-w-4xl text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">{title}</h2>
      {description ? <p className="max-w-3xl text-sm leading-7 text-fg-2">{description}</p> : null}
    </header>
  );
}

export function EngineeringPlaybookPage() {
  useBilingualI18nRevision();

  useDocumentTitle(
    bi("ToonStudio 기술 플레이북 · 설계 원칙과 아키텍처 결정", "ToonStudio engineering playbook · Principles and architecture decisions"),
  );

  const tocGroups: readonly EngineeringTocGroup[] = [
    {
      id: "principles-group",
      items: [{ id: "principles", label: bi("설계 원칙 5가지", "Five design principles") }],
    },
    {
      id: "dossiers-group",
      label: bi("아키텍처 결정", "Architecture decisions"),
      items: ENGINEERING_PLAYBOOK_DOSSIERS.map((dossier, index) => ({
        id: `dossier-${dossier.id}`,
        label: bi(dossier.title.ko, dossier.title.en),
        marker: String(index + 1).padStart(2, "0"),
      })),
    },
    {
      id: "evidence-group",
      label: bi("원칙을 만든 근거", "Where the principles came from"),
      items: [
        { id: "benchmarks", label: bi("시장·제품 벤치마크", "Market and product benchmarks") },
        { id: "ai-workbench", label: bi("AI 작업 방식", "AI workbench") },
        { id: "relocated", label: bi("다른 페이지로 옮긴 자료", "Material moved to other pages") },
      ],
    },
  ];

  return (
    <EngineeringPageFrame pageId="playbook" className="engineering-playbook">
      <EngineeringPageIntro
        pageId="playbook"
        eyebrow="ENGINEERING PLAYBOOK"
        title={bi("다른 서비스에서도 재사용할 설계 원칙과 아키텍처 결정", "Design principles and architecture decisions you can reuse")}
        description={bi(
          "패키지 이름보다 먼저 고정한 원칙과, 그 원칙으로 내린 열 가지 아키텍처 결정을 같은 형식으로 정리했습니다. 기술이 바뀌어도 데이터 권위와 검증 순서는 유지됩니다.",
          "The principles fixed before any package choice, and ten architecture decisions made with them, in one consistent format. Data authority and verification order survive technology changes.",
        )}
      />

      <EngineeringKeySummary
        points={[
          bi("데이터 권위·실패 범위·대체 경로·검증 순서를 패키지 선택보다 먼저 정합니다.", "Data authority, failure scope, fallbacks and verification order come before package choices."),
          bi("열 가지 결정은 모두 질문 → 배경 → 구조와 선택 → 성과 → 다른 서비스 적용 → 한계 순서로 읽습니다.", "All ten decisions read as question → background → structure → results → reuse → limits."),
          bi("경쟁 제품은 기능 목록이 아니라 원칙으로 읽고, 확인하지 못한 동등성은 주장하지 않습니다.", "Competitors are read as principles, not feature lists; unverified parity is never claimed."),
          bi("AI는 제품 기능·로컬 추론·개발 도구·조사로 나눠 권한과 완료 기준을 따로 둡니다.", "AI is split into product features, local inference, engineering tools and research, each with its own permissions."),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("원칙 {value0}", "{value0} principles")), { value0: ENGINEERING_PLAYBOOK_PRINCIPLES.length })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("결정 {value0}", "{value0} decisions")), { value0: ENGINEERING_PLAYBOOK_DOSSIERS.length })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("벤치마크군 {value0}", "{value0} benchmark groups")), { value0: ENGINEERING_BENCHMARK_GROUPS.length })}</EngineeringMetaChip>
          </>
        )}
      />

      <EngineeringLongformLayout groups={tocGroups} bodyId={BODY_ID} tocLabel={bi("기술 플레이북 목차", "Engineering playbook sections")}>
        <div className="grid gap-16">
          <section id="principles" aria-labelledby="playbook-principles-title" className="grid gap-6">
            <SectionHeading
              id="playbook-principles-title"
              eyebrow="DESIGN PRINCIPLES"
              title={bi("패키지 선택보다 먼저 고정한 다섯 가지 원칙", "Five principles fixed before package selection")}
              description={bi(
                "브러시·협업·3D·AI처럼 구현 방식이 크게 다른 기능에도 같은 원칙을 적용합니다.",
                "The same principles apply to very different capabilities such as brushes, collaboration, 3D and AI.",
              )}
            />
            <ol className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              {ENGINEERING_PLAYBOOK_PRINCIPLES.map((principle, index) => (
                <li key={principle.id} className="rounded-3xl border border-line/70 bg-card/65 p-5 shadow-sm">
                  <span className="flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                      <ShieldCheck size={18} aria-hidden="true" />
                    </span>
                    <span className="font-display text-xs font-black text-fg-3">{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <h3 className="mt-4 text-base font-black text-fg">{bi(principle.title.ko, principle.title.en)}</h3>
                  <p className="mt-2 text-xs leading-6 text-fg-2">{bi(principle.body.ko, principle.body.en)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="playbook-dossiers-title" className="grid gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                id="playbook-dossiers-title"
                eyebrow="ARCHITECTURE DECISIONS"
                title={bi("서비스를 만들며 내린 열 가지 아키텍처 결정", "Ten architecture decisions behind the service")}
              />
              <Link
                href="/about/technology/story"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {bi("전체 기술 챕터", "All engineering chapters")}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            {ENGINEERING_PLAYBOOK_DOSSIERS.map((dossier, index) => {
              const Icon = DOSSIER_ICONS[dossier.id] ?? Boxes;
              return (
                <article
                  key={dossier.id}
                  id={`dossier-${dossier.id}`}
                  className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent-2">
                        {String(index + 1).padStart(2, "0")} · {dossier.eyebrow.split(" · ").slice(1).join(" · ")}
                      </span>
                    </span>
                    <EngineeringStatusBadge status={dossier.status} />
                  </div>
                  <h3 className="mt-5 text-balance break-keep text-2xl font-black tracking-tight text-fg">{bi(dossier.title.ko, dossier.title.en)}</h3>
                  <p className="mt-4 rounded-2xl border-l-4 border-accent-2 bg-accent-2/8 px-4 py-3 text-sm font-bold leading-7 text-fg">
                    {bi(dossier.question.ko, dossier.question.en)}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-fg-2">{bi(dossier.background.ko, dossier.background.en)}</p>
                  <EngineeringDisclosure
                    className="mt-5"
                    summary={(
                      <>
                        <Workflow size={16} className="shrink-0 text-accent" aria-hidden="true" />
                        <span>{bi("구조·성과·적용·한계와 근거", "Structure, results, reuse, limits and evidence")}</span>
                      </>
                    )}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <BulletList icon={Workflow} title={bi("구조와 선택", "Architecture and decisions")} items={dossier.architecture.map((item) => bi(item.ko, item.en))} />
                      <BulletList icon={CheckCircle2} title={bi("기술적 성과", "Engineering achievements")} items={dossier.achievements.map((item) => bi(item.ko, item.en))} />
                      <BulletList icon={Sparkles} title={bi("다른 서비스에 적용", "Apply elsewhere")} items={dossier.portability.map((item) => bi(item.ko, item.en))} />
                      <BulletList icon={ShieldCheck} title={bi("한계와 금지된 주장", "Limits and prohibited claims")} items={dossier.limits.map((item) => bi(item.ko, item.en))} />
                    </div>
                    <h4 className="mt-5 flex items-center gap-2 text-sm font-black text-fg">
                      <LibraryBig size={15} className="text-accent" aria-hidden="true" />
                      {bi("확인 가능한 코드·문서 근거", "Inspectable code and document evidence")}
                    </h4>
                    <ul className="mt-3 grid gap-2 md:grid-cols-2">
                      {dossier.evidence.map((path) => (
                        <li key={path}><code className="eng-code block overflow-x-auto whitespace-nowrap rounded-xl px-3 py-2 font-mono text-[0.68rem]">{path}</code></li>
                      ))}
                    </ul>
                  </EngineeringDisclosure>
                </article>
              );
            })}
          </section>

          <section id="benchmarks" aria-labelledby="playbook-benchmark-title" className="grid gap-6">
            <SectionHeading
              id="playbook-benchmark-title"
              eyebrow="MARKET & PRODUCT BENCHMARKS"
              title={bi("경쟁 제품을 기능 체크리스트가 아니라 제품 원칙으로 읽기", "Read competing products as product principles, not feature checklists")}
              description={bi(
                "실제 사용, 제한된 평가, UX 참고와 대안을 구분합니다. 공식 문서에서 확인하지 못한 접근성·암호화·성능을 ‘없음’으로 판정하지 않고, 실제 벤치마크 없는 동등성 표현도 쓰지 않습니다.",
                "Used, bounded evaluation, UX inspiration and alternatives remain distinct. Unknown accessibility, encryption or performance is never treated as absence, and parity is never claimed without real benchmarks.",
              )}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {ENGINEERING_BENCHMARK_GROUPS.map((group) => (
                <article key={group.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-5 shadow-sm sm:p-6">
                  <h3 className="text-lg font-black tracking-tight text-fg">{bi(group.title.ko, group.title.en)}</h3>
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={bi("비교 제품", "Compared products")}>
                    {group.products.map((product) => (
                      <li key={product} className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">{product}</li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-2xl bg-raised/70 p-4 text-sm leading-7 text-fg-2">{bi(group.marketSignal.ko, group.marketSignal.en)}</p>
                  <EngineeringDisclosure
                    className="mt-4"
                    summary={<span>{bi("배운 점·적용·주장하지 않는 범위", "Learned, applied and not claimed")}</span>}
                  >
                    {group.observedPatterns?.length ? (
                      <BulletList icon={LibraryBig} title={bi("공식 자료에서 확인한 패턴", "Patterns observed in official material")} items={group.observedPatterns.map((item) => bi(item.ko, item.en))} />
                    ) : null}
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <BulletList icon={Sparkles} title={bi("배운 점", "Learned")} items={group.learned.map((item) => bi(item.ko, item.en))} />
                      <BulletList icon={CheckCircle2} title={bi("적용", "Applied")} items={group.applied.map((item) => bi(item.ko, item.en))} />
                      <BulletList icon={ShieldCheck} title={bi("주장하지 않음", "Do not claim")} items={group.doNotClaim.map((item) => bi(item.ko, item.en))} />
                    </div>
                    {group.evidenceNote ? (
                      <p className="mt-4 border-t border-line/70 pt-3 text-[0.72rem] leading-6 text-fg-3">{bi(group.evidenceNote.ko, group.evidenceNote.en)}</p>
                    ) : null}
                  </EngineeringDisclosure>
                </article>
              ))}
            </div>
            <Link
              href="/about/technology/references"
              className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {bi("제품별 참고 자료 보기", "See product references")}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>

          <section id="ai-workbench" aria-labelledby="playbook-ai-title" className="grid gap-6">
            <SectionHeading
              id="playbook-ai-title"
              eyebrow="AI WORKBENCH"
              title={bi("AI를 제품 기능, 로컬 추론, 개발 도구와 조사 과정으로 분리", "Separate AI product capability, local inference, engineering tools and research")}
              description={bi(
                "같은 ‘AI 활용’이라도 사용자 데이터와 비용을 다루는 제품 기능, 코드 변경을 제안하는 개발 에이전트, 제작 도구·저장소를 조작하는 도구 호출은 서로 다른 권한과 완료 기준이 필요합니다.",
                "Product features handling user data and cost, coding agents proposing changes and tool calls operating DCC or repositories each need different permissions and completion criteria.",
              )}
            />
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {ENGINEERING_AI_WORKBENCH.map((item) => (
                <article key={item.id} className="rounded-3xl border border-line/70 bg-panel/60 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
                      <Bot size={18} aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-line bg-card px-3 py-1 text-[0.66rem] font-black text-fg-2">{bi(item.layer.ko, item.layer.en)}</span>
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={bi("도구", "Tools")}>
                    {item.tools.map((tool) => (
                      <li key={tool} className="rounded-full bg-raised px-2.5 py-1 text-[0.66rem] font-semibold text-fg-2">{tool}</li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid gap-3 text-xs leading-6">
                    <div>
                      <dt className="font-black text-fg">{bi("활용", "Use")}</dt>
                      <dd className="mt-1 text-fg-2">{bi(item.use.ko, item.use.en)}</dd>
                    </div>
                    <div>
                      <dt className="font-black text-fg">{bi("남기는 산출물", "Artifact")}</dt>
                      <dd className="mt-1 text-fg-2">{bi(item.artifact.ko, item.artifact.en)}</dd>
                    </div>
                    <div className="rounded-2xl border border-warn/30 bg-warn/10 p-3">
                      <dt className="font-black text-warn">{bi("안전장치", "Guardrail")}</dt>
                      <dd className="mt-1 text-fg-2">{bi(item.guardrail.ko, item.guardrail.en)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section id="relocated" aria-labelledby="playbook-relocated-title" className="grid gap-5">
            <SectionHeading
              id="playbook-relocated-title"
              eyebrow="MOVED FOR CLARITY"
              title={bi("목적에 맞는 페이지로 옮긴 자료", "Material moved to its purpose-built page")}
              description={bi(
                "플레이북은 원칙과 결정만 다룹니다. 적용 순서·발표 구성·영상 구성은 아래 페이지에서 이어집니다.",
                "The playbook covers principles and decisions only. Adoption steps, talk plans and film plans continue on these pages.",
              )}
            />
            <ul className="grid gap-3 md:grid-cols-3">
              {RELOCATED.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex h-full flex-col gap-2 rounded-3xl border border-line/70 bg-card/60 p-5 transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Icon size={20} className="text-accent" aria-hidden="true" />
                      <span className="text-base font-black text-fg group-hover:text-accent">{bi(item.title.ko, item.title.en)}</span>
                      <span className="text-sm leading-6 text-fg-2">{bi(item.body.ko, item.body.en)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </EngineeringLongformLayout>
    </EngineeringPageFrame>
  );
}
