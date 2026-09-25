import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  Bug,
  CheckCircle2,
  CloudCog,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  Globe2,
  Hammer,
  Layers3,
  NotebookTabs,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Workflow,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_FIELD_CATEGORY_META,
  ENGINEERING_FIELD_NOTES,
  ENGINEERING_IMPLEMENTATION_INVENTORY,
  ENGINEERING_OPEN_APIS,
  ENGINEERING_REFERENCE_PRODUCTS,
  ENGINEERING_REFERENCE_ROLE_META,
  ENGINEERING_TROUBLESHOOTING_CASES,
  type EngineeringFieldCategory,
} from "./engineering-field-notes-content";
import type { EngineeringEvidenceKind } from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringFieldNotesPage", ko, en);

const CATEGORY_FILTERS: readonly {
  readonly id: "all" | EngineeringFieldCategory;
  readonly icon: typeof NotebookTabs;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "all", icon: NotebookTabs, ko: "전체", en: "All" },
  { id: "workers-pwa", icon: Workflow, ko: "Worker · PWA", en: "Workers · PWA" },
  { id: "ai-cost", icon: Bot, ko: "무료 AI · 인프라", en: "Free AI · infra" },
  { id: "three-d-dcc", icon: Boxes, ko: "Blender · 3D", en: "Blender · 3D" },
  { id: "open-data", icon: Globe2, ko: "Open API", en: "Open APIs" },
  { id: "reliability", icon: Bug, ko: "복구 · 문제 해결", en: "Recovery" },
];

const FIELD_CATEGORY_ICONS: Record<EngineeringFieldCategory, typeof NotebookTabs> = {
  "workers-pwa": Workflow,
  "ai-cost": CloudCog,
  "three-d-dcc": Layers3,
  "open-data": Globe2,
  reliability: ShieldCheck,
};

const EVIDENCE_ICONS: Record<EngineeringEvidenceKind, typeof Code2> = {
  code: FileCode2,
  test: TestTube2,
  workflow: Workflow,
  document: FileText,
};

const WORKER_PIPELINE = [
  { ko: "UI에서 intent와 작은 metadata 생성", en: "Create intent and small metadata in the UI" },
  { ko: "payload·byte budget·requestId 검증", en: "Validate payload, byte budget and request ID" },
  { ko: "ArrayBuffer ownership transfer", en: "Transfer ArrayBuffer ownership" },
  { ko: "Worker에서 계산·WASM·파일 변환", en: "Run compute, WASM or file conversion in the worker" },
  { ko: "abort·timeout·late response fencing", en: "Fence abort, timeout and late responses" },
  { ko: "schema 검증 후 문서 commit", en: "Validate schema, then commit to the document" },
] as const;

const PWA_PIPELINE = [
  { ko: "Web App Manifest와 명시적 설치 선택", en: "Web App Manifest and explicit install choice" },
  { ko: "빌드 manifest에서 precache plan 생성", en: "Generate a precache plan from the build manifest" },
  { ko: "API·탐색·해시 자산별 전략 분리", en: "Separate API, navigation and hashed-asset strategies" },
  { ko: "schema·content hash가 맞을 때만 활성화", en: "Activate only when schema and content hashes match" },
  { ko: "controllerchange one-shot reload guard", en: "Guard controllerchange with a one-shot reload" },
  { ko: "반복 실패 시 unregister·cache cleanup", en: "Unregister and clean caches after repeated failure" },
] as const;

function ProcessRail({
  title,
  description,
  steps,
  icon: Icon,
}: {
  readonly title: string;
  readonly description: string;
  readonly steps: readonly { readonly ko: string; readonly en: string }[];
  readonly icon: typeof Workflow;
}) {
  useBilingualI18nRevision();


  return (
    <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6 shadow-sm sm:p-7">
      <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
        <Icon size={21} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-xl font-black tracking-tight text-fg">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-fg-2">{description}</p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.en} className="relative rounded-2xl border border-line/65 bg-panel/70 p-4">
            <span className="grid size-7 place-items-center rounded-full bg-accent text-[0.66rem] font-black text-on-accent">
              {index + 1}
            </span>
            <p className="mt-3 text-xs leading-6 text-fg-2">{bi((step).ko, (step).en)}</p>
            {index < steps.length - 1 ? (
              <ArrowRight className="absolute -right-2.5 top-5 hidden rounded-full bg-page text-accent xl:block" size={15} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </article>
  );
}

export function EngineeringFieldNotesPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();

  const [filter, setFilter] = useState<"all" | EngineeringFieldCategory>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(getActiveI18nLocale());
  const notes = useMemo(() => {
    const candidates = filter === "all"
      ? ENGINEERING_FIELD_NOTES
      : ENGINEERING_FIELD_NOTES.filter((note) => note.category === filter);
    if (!normalizedQuery) return candidates;
    return candidates.filter((note) => [
      note.eyebrow,
      bi((note.title).ko, (note.title).en),
      bi((note.summary).ko, (note.summary).en),
      bi((note.problem).ko, (note.problem).en),
      bi((note.pattern).ko, (note.pattern).en),
      bi((note.boundary).ko, (note.boundary).en),
      bi((ENGINEERING_FIELD_CATEGORY_META[note.category].label).ko, (ENGINEERING_FIELD_CATEGORY_META[note.category].label).en),
      ...note.technologies,
    ].join(" ").toLocaleLowerCase(getActiveI18nLocale()).includes(normalizedQuery));
  }, [filter, normalizedQuery]);
  const inventoryCards = [
    { icon: Workflow, value: ENGINEERING_IMPLEMENTATION_INVENTORY.workerEntries, label: bi("전용 Worker 엔트리", "Dedicated worker entries") },
    { icon: Code2, value: ENGINEERING_IMPLEMENTATION_INVENTORY.workerClients, label: bi("Worker 클라이언트", "Worker clients") },
    { icon: RefreshCw, value: ENGINEERING_IMPLEMENTATION_INVENTORY.serviceWorkerRuntimeFiles, label: bi("Service Worker 런타임 모듈", "Service-worker runtime modules") },
    { icon: Bot, value: ENGINEERING_IMPLEMENTATION_INVENTORY.localInferenceRuntimes.length, label: bi("브라우저 로컬 AI 런타임", "Browser-local AI runtimes") },
    { icon: Boxes, value: ENGINEERING_IMPLEMENTATION_INVENTORY.blenderMcpCommands, label: bi("Blender MCP 허용 명령", "Allowlisted Blender MCP commands") },
    { icon: PlugZap, value: ENGINEERING_IMPLEMENTATION_INVENTORY.openApiProviders, label: bi("검증된 Open API adapter", "Reviewed Open API adapters") },
  ] as const;

  useDocumentTitle(
    bi("ToonStudio 기술 심화 노트 · Worker, PWA, AI, Blender, 3D와 문제 해결", "ToonStudio engineering field notes · Workers, PWA, AI, Blender, 3D and troubleshooting"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="ENGINEERING FIELD NOTES · REUSABLE PATTERNS"
        title={
          bi("실제 구현에서 남은 기술 판단과 실패 복구 과정을 더 깊게 공개합니다.", "Deeper implementation decisions and recovery lessons from the real product.")
        }
        description={
          bi("Worker와 PWA, 무료 우선 AI·인프라, Blender MCP, 멀티 3D 엔진, Open API와 트러블슈팅을 다른 개발에서도 재사용할 수 있는 경계와 절차로 정리했습니다. 운영 중·설정 필요·실험·참고 상태를 구분하고 모든 주장을 저장소 근거와 연결합니다.", "Workers, PWA, free-first AI and infrastructure, Blender MCP, multi-engine 3D, Open APIs and troubleshooting are documented as reusable boundaries and procedures. Live, configured, experimental and reference states remain distinct and evidence-backed.")
        }
        aside={
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-5">
            <NotebookTabs size={21} className="text-accent" aria-hidden="true" />
            <p className="mt-4 text-sm font-black text-fg">
              {bi("패키지보다 실패 경계와 복구 계약", "Failure boundaries over package lists")}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-3">
              {bi("같은 기술을 쓰지 않아도 입력·출력·권위·예산·취소·복구를 유지하면 설계를 재사용할 수 있습니다.", "The design remains reusable when inputs, outputs, authority, budgets, cancellation and recovery survive a technology change.")
              }
            </p>
          </div>
        }
      />

      <section className="mb-8" aria-labelledby="implementation-inventory-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "REPOSITORY-VERIFIED INVENTORY")}</p>
            <h2 id="implementation-inventory-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bi("설명에 사용한 구현 수치를 저장소와 함께 검증합니다.", "Implementation figures are verified against the repository.")}
            </h2>
          </div>
          <p className="text-xs text-fg-3">
            {bi("검토일", "Reviewed")} · {ENGINEERING_IMPLEMENTATION_INVENTORY.reviewedAt}
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {inventoryCards.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-3xl border border-line/70 bg-card/65 p-5 shadow-sm">
                <Icon size={19} className="text-accent" aria-hidden="true" />
                <p className="mt-4 font-display text-3xl font-black tracking-tight text-fg">{item.value}</p>
                <p className="mt-2 text-xs leading-6 text-fg-3">{item.label}</p>              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-6 text-fg-3">
          {bi("Worker 수치는 apps/web/src의 전용 worker와 worker-client 파일을 구분해 계산하며, 변경 시 콘텐츠 계약 테스트가 실패합니다.", "Worker figures count dedicated worker and worker-client files separately under apps/web/src; content-contract tests fail when they drift.")
          }
        </p>
      </section>

      <section aria-labelledby="field-note-filter-title">
        <h2 id="field-note-filter-title" className="sr-only">
          {bi("기술 노트 검색과 분야 필터", "Engineering field-note search and filters")}
        </h2>
        <div className="grid gap-4 rounded-3xl border border-line/70 bg-panel/55 p-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-end">
          <div>
            <label htmlFor="engineering-field-note-search" className="px-1 text-xs font-black text-fg">
              {bi("기술 노트 검색", "Search field notes")}
            </label>
            <div className="relative mt-2">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                id="engineering-field-note-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={bi("예: Worker, MediaPipe, Blender, OPFS", "e.g. Worker, MediaPipe, Blender, OPFS")}
                className="min-h-11 w-full rounded-2xl border border-line bg-card py-2 pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent"
              />
            </div>            <p className="mt-2 px-1 text-[0.68rem] text-fg-3" role="status">
              {formatI18nTemplate(String(bi("{value0}개 / 전체 {value1}개 노트", "{value0} of {value1} notes")), { value0: notes.length, value1: ENGINEERING_FIELD_NOTES.length })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((item) => {
              const Icon = item.icon;
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item.id)}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors",
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                  )}                >
                  <Icon size={15} aria-hidden="true" />
                  {bi((item).ko, (item).en)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5" aria-live="polite" aria-label={bi("심화 기술 노트", "Engineering field notes")}>
        {notes.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-line-strong bg-card/45 p-8 text-center" role="status">
            <Search size={22} className="mx-auto text-accent" aria-hidden="true" />
            <p className="mt-4 font-black text-fg">{bi("검색 조건과 일치하는 기술 노트가 없습니다.", "No field notes match the current search.")}</p>
            <p className="mt-2 text-sm leading-7 text-fg-3">{bi("검색어를 줄이거나 전체 분야를 선택해 보세요.", "Shorten the query or select all categories.")}</p>
          </div>
        ) : notes.map((note) => {
          const Icon = FIELD_CATEGORY_ICONS[note.category];
          const category = ENGINEERING_FIELD_CATEGORY_META[note.category];
          return (
            <article
              key={note.id}
              id={note.id}
              data-engineering-field-note={note.category}
              data-engineering-field-note-id={note.id}
              className="scroll-mt-28 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7 lg:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-display text-[0.64rem] font-black uppercase tracking-[0.15em] text-accent">{note.eyebrow}</p>
                    <p className="mt-1 text-xs text-fg-3">{bi((category.label).ko, (category.label).en)}</p>
                  </div>
                </div>
                <EngineeringStatusBadge status={note.status} locale={locale} />
              </div>

              <h2 className="mt-6 max-w-5xl text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bi((note.title).ko, (note.title).en)}
              </h2>
              <p className="mt-4 max-w-5xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
                {bi((note.summary).ko, (note.summary).en)}
              </p>

              <dl className="mt-7 grid gap-3 lg:grid-cols-3">
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-danger">{bi("문제", "Problem")}</dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{bi((note.problem).ko, (note.problem).en)}</dd>
                </div>
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-accent">{bi("적용 패턴", "Pattern")}</dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{bi((note.pattern).ko, (note.pattern).en)}</dd>
                </div>
                <div className="rounded-3xl border border-line/65 bg-card/65 p-5">
                  <dt className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-warning">{bi("경계와 한계", "Boundary")}</dt>
                  <dd className="mt-3 text-sm leading-7 text-fg-2">{bi((note.boundary).ko, (note.boundary).en)}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2" aria-label={bi("관련 기술", "Related technologies")}>
                {note.technologies.map((technology) => (
                  <span key={technology} className="rounded-full border border-line bg-card px-3 py-1.5 font-display text-[0.67rem] font-semibold text-fg-2">
                    {technology}
                  </span>
                ))}
              </div>

              <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_1fr]">
                <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "{v0}-reuse-title"), { v0: String(note.id) })} className="rounded-3xl border border-line/70 bg-card/50 p-5">
                  <h3 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "{v0}-reuse-title"), { v0: String(note.id) })} className="flex items-center gap-2 text-sm font-black text-fg">
                    <Wrench size={16} className="text-accent" aria-hidden="true" />
                    {bi("다른 프로젝트 적용 순서", "Reuse sequence")}
                  </h3>
                  <ol className="mt-4 space-y-3">
                    {note.reuseSteps.map((step, index) => (
                      <li key={step.en} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-4">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                        <p className="pt-0.5 text-xs leading-6 text-fg-2">{bi((step).ko, (step).en)}</p>
                      </li>
                    ))}
                  </ol>
                </section>

                <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "{v0}-evidence-title"), { v0: String(note.id) })} className="rounded-3xl border border-line/70 bg-card/50 p-5">
                  <h3 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "{v0}-evidence-title"), { v0: String(note.id) })} className="flex items-center gap-2 text-sm font-black text-fg">
                    <Code2 size={16} className="text-accent" aria-hidden="true" />
                    {bi("코드·테스트·공식 자료", "Code, tests and official sources")}
                  </h3>
                  <ul className="mt-4 space-y-3">
                    {note.evidence.map((item) => {
                      const EvidenceIcon = EVIDENCE_ICONS[item.kind];
                      return (
                        <li key={`${item.kind}-${item.path}`} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-4">
                          <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                            <EvidenceIcon size={14} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-fg">{bi((item.label).ko, (item.label).en)}</p>
                            <code className="mt-2 block overflow-x-auto whitespace-nowrap font-mono text-[0.64rem] text-fg-3">{item.path}</code>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {note.references.map((reference) => (
                      <li key={reference.id}>
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex h-full min-h-14 items-start justify-between gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent"
                        >
                          <span>
                            {reference.title}
                            <span className="mt-1 block text-[0.62rem] font-normal leading-5 text-fg-3">{bi((reference.note).ko, (reference.note).en)}</span>
                          </span>
                          <ExternalLink size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
          );
        })}
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="worker-pwa-pattern-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "BROWSER EXECUTION BLUEPRINTS")}</p>
        <h2 id="worker-pwa-pattern-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("Worker와 PWA는 서로 다른 실패를 격리하는 두 개의 실행 계층입니다.", "Workers and PWA isolate two different classes of failure.")}
        </h2>
        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          <ProcessRail
            title={bi("무거운 계산의 Worker 경계", "Worker boundary for heavy compute")}
            description={bi("메인 스레드의 포인터·캔버스 응답성을 지키면서도 계산 결과의 문서 commit 권위는 넘기지 않습니다.", "Protect main-thread pointer and canvas responsiveness without handing document commit authority to workers.")}
            steps={WORKER_PIPELINE}
            icon={Workflow}
          />
          <ProcessRail
            title={bi("PWA 설치·오프라인·업데이트 경계", "PWA install, offline and update boundary")}
            description={bi("설치 가능성과 캐시 편의보다 오래된 실행 코드가 작업 데이터를 손상시키지 않는 것을 우선합니다.", "Preventing stale runtime code from damaging work takes priority over install and cache convenience.")}
            steps={PWA_PIPELINE}
            icon={RefreshCw}
          />
        </div>
      </section>

      <section aria-labelledby="open-api-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "OPEN API ADAPTER MAP")}</p>
        <h2 id="open-api-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("Open API마다 데이터보다 먼저 권리·출처·실패 규칙을 정의했습니다.", "Rights, provenance and failure rules precede data for every Open API.")}
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi("API가 공개되어 있다는 사실과 결과물을 다시 배포할 수 있다는 사실은 다릅니다. 아래 adapter는 제공처마다 다른 공개 이용 flag, 상세 조회, image host와 오류를 독립적으로 검증합니다.", "Public API access does not automatically grant redistribution rights. Each adapter validates provider-specific rights flags, detail data, image hosts and errors independently.")
          }
        </p>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {ENGINEERING_OPEN_APIS.map((api) => (
            <article key={api.id} className="rounded-[1.75rem] border border-line/70 bg-panel/60 p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                  <PlugZap size={19} aria-hidden="true" />
                </span>
                <EngineeringStatusBadge status={api.status} locale={locale} />
              </div>
              <h3 className="mt-5 text-xl font-black text-fg">{api.provider}</h3>
              <dl className="mt-5 space-y-3 text-xs leading-6">
                <div className="rounded-2xl border border-line/65 bg-card/60 p-4">
                  <dt className="font-black text-accent">{bi("활용", "Purpose")}</dt>
                  <dd className="mt-1 text-fg-2">{bi((api.purpose).ko, (api.purpose).en)}</dd>
                </div>
                <div className="rounded-2xl border border-line/65 bg-card/60 p-4">
                  <dt className="font-black text-fg">{bi("접근 계약", "Access contract")}</dt>
                  <dd className="mt-1 text-fg-2">{bi((api.access).ko, (api.access).en)}</dd>
                </div>
                <div className="rounded-2xl border border-line/65 bg-card/60 p-4">
                  <dt className="font-black text-success">{bi("권리 gate", "Rights gate")}</dt>
                  <dd className="mt-1 text-fg-2">{bi((api.rightsGate).ko, (api.rightsGate).en)}</dd>
                </div>
                <div className="rounded-2xl border border-line/65 bg-card/60 p-4">
                  <dt className="font-black text-warning">{bi("실패·복구", "Failure and recovery")}</dt>
                  <dd className="mt-1 text-fg-2">{bi((api.resilience).ko, (api.resilience).en)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                {api.evidence.map((item) => (
                  <code key={item.path} className="overflow-x-auto whitespace-nowrap rounded-xl bg-card px-3 py-2 font-mono text-[0.63rem] text-fg-3">{item.path}</code>
                ))}
                <a href={api.officialUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-line-strong bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:border-accent/40 hover:text-accent">
                  {bi("공식 API 문서", "Official API documentation")}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="troubleshooting-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "TROUBLESHOOTING CASEBOOK")}</p>
        <h2 id="troubleshooting-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("실패를 숨기지 않고 재현 가능한 회귀 계약으로 바꾼 사례", "Failures converted into reproducible regression contracts")}
        </h2>
        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          {ENGINEERING_TROUBLESHOOTING_CASES.map((item, index) => (
            <article key={item.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-5 shadow-sm sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-2xl border border-warning/30 bg-warning-soft/20 font-display text-xs font-black text-warning">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <EngineeringStatusBadge status={item.status} locale={locale} />
              </div>
              <h3 className="mt-5 text-balance text-xl font-black tracking-tight text-fg">{bi((item.title).ko, (item.title).en)}</h3>
              <dl className="mt-5 space-y-3">
                <div className="rounded-2xl border border-danger/20 bg-danger-soft/10 p-4">
                  <dt className="flex items-center gap-2 text-xs font-black text-danger"><AlertTriangle size={14} aria-hidden="true" />{bi("증상", "Symptom")}</dt>
                  <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.symptom).ko, (item.symptom).en)}</dd>
                </div>
                <div className="rounded-2xl border border-line/65 bg-panel/65 p-4">
                  <dt className="flex items-center gap-2 text-xs font-black text-fg"><Bug size={14} className="text-accent" aria-hidden="true" />{bi("근본 원인", "Root cause")}</dt>
                  <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.rootCause).ko, (item.rootCause).en)}</dd>
                </div>
                <div className="rounded-2xl border border-success/25 bg-success-soft/15 p-4">
                  <dt className="flex items-center gap-2 text-xs font-black text-success"><Hammer size={14} aria-hidden="true" />{bi("수정", "Fix")}</dt>
                  <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.fix).ko, (item.fix).en)}</dd>
                </div>
                <div className="rounded-2xl border border-accent/25 bg-accent-soft/15 p-4">
                  <dt className="flex items-center gap-2 text-xs font-black text-accent"><ShieldCheck size={14} aria-hidden="true" />{bi("재발 방지", "Prevention")}</dt>
                  <dd className="mt-2 text-xs leading-6 text-fg-2">{bi((item.prevention).ko, (item.prevention).en)}</dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-2">
                {item.evidence.map((evidence) => (
                  <li key={evidence.path} className="rounded-xl border border-line/60 bg-panel/60 px-3 py-2">
                    <p className="text-[0.65rem] font-bold text-fg">{bi((evidence.label).ko, (evidence.label).en)}</p>
                    <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[0.61rem] text-fg-3">{evidence.path}</code>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="reference-products-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringFieldNotesPage", "en", "REFERENCE PRODUCTS · ADOPTION BOUNDARIES")}</p>
        <h2 id="reference-products-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("참고한 제품과 실제로 채택한 패턴, 채택하지 않은 이유를 구분합니다.", "Reference products are separated from applied patterns and rejected adoption choices.")}
        </h2>
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ENGINEERING_REFERENCE_PRODUCTS.map((product) => {
            const role = ENGINEERING_REFERENCE_ROLE_META[product.role];
            return (
              <article key={product.id} className="flex flex-col rounded-[1.75rem] border border-line/70 bg-panel/60 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-2xl border border-line bg-card text-accent">
                    <Sparkles size={18} aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-line bg-card px-3 py-1.5 text-[0.64rem] font-black text-fg-2" title={bi((role.description).ko, (role.description).en)}>
                    {bi((role.label).ko, (role.label).en)}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-black text-fg">{product.name}</h3>
                <dl className="mt-4 flex-1 space-y-3 text-xs leading-6">
                  <div>
                    <dt className="font-black text-accent">{bi("참고한 점", "Lesson")}</dt>
                    <dd className="mt-1 text-fg-2">{bi((product.lesson).ko, (product.lesson).en)}</dd>
                  </div>
                  <div>
                    <dt className="font-black text-success">{bi("적용", "Applied")}</dt>
                    <dd className="mt-1 text-fg-2">{bi((product.applied).ko, (product.applied).en)}</dd>
                  </div>
                  <div>
                    <dt className="font-black text-warning">{bi("경계", "Boundary")}</dt>
                    <dd className="mt-1 text-fg-2">{bi((product.boundary).ko, (product.boundary).en)}</dd>
                  </div>
                </dl>
                <a href={product.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-line-strong bg-card px-3 py-2 text-xs font-bold text-fg-2 hover:border-accent/40 hover:text-accent">
                  {bi("공식 사이트", "Official site")}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="mt-12 flex items-start gap-4 rounded-[2rem] border border-accent/25 bg-accent-soft/25 p-6" role="note">
        <CheckCircle2 size={23} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-black text-fg">{bi("검토일과 상태는 계속 갱신해야 합니다.", "Review dates and statuses must keep moving.")}</p>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-fg-2">
            {bi("무료 티어, API 약관, 브라우저 지원과 엔진 기능은 바뀔 수 있습니다. 이 페이지는 2026년 9월 17일 저장소 구현과 공식 자료를 기준으로 하며, 실제 도입 시 공식 문서·라이선스·가격·브라우저 호환성을 다시 확인해야 합니다.", "Free tiers, API terms, browser support and engine capability can change. This page reflects repository implementation and official material reviewed on September 17, 2026; adoption requires rechecking current docs, licenses, pricing and compatibility.")
            }
          </p>
        </div>
      </aside>
    </Container>
  );
}
