import {
  ArrowRight,
  Bot,
  Boxes,
  Bug,
  CloudCog,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  Globe2,
  Layers3,
  NotebookTabs,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  TestTube2,
  Workflow,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ENGINEERING_FIELD_CATEGORY_META,
  ENGINEERING_FIELD_NOTES,
  ENGINEERING_IMPLEMENTATION_INVENTORY,
  ENGINEERING_OPEN_APIS,
  ENGINEERING_TROUBLESHOOTING_CASES as FIELD_INCIDENTS,
  type EngineeringFieldCategory,
  type EngineeringFieldNote,
} from "./engineering-field-notes-content";
import { fromArchiveIncident, fromFieldIncident } from "./engineering-incidents";
import type { EngineeringEvidenceKind } from "./engineering-story-content";
import { ENGINEERING_TROUBLESHOOTING_CASES as ARCHIVE_INCIDENTS } from "./engineering-story-deep-dive-content";
import { EngineeringIncidentCard } from "./EngineeringIncidents";
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

import { SectionArt } from "@/shared/components/section-art";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringFieldNotesPage", ko, en);

const BODY_ID = "engineering-field-notes-body";

type CategoryFilter = "all" | EngineeringFieldCategory;

const CATEGORY_FILTERS: readonly { readonly id: CategoryFilter; readonly icon: typeof NotebookTabs; readonly ko: string; readonly en: string }[] = [
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

/** 두 장애 기록 묶음을 하나의 목록으로 합친다(원본 형식은 유지). */
const INCIDENTS = [...FIELD_INCIDENTS.map(fromFieldIncident), ...ARCHIVE_INCIDENTS.map(fromArchiveIncident)];

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
    <article className="rounded-[2rem] border border-line/70 bg-card/65 p-5 shadow-sm sm:p-6">
      <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-black tracking-tight text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-fg-2">{description}</p>
      <ol className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.en} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/70 p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[0.66rem] font-black text-on-accent">{index + 1}</span>
            <span className="pt-0.5 text-xs leading-6 text-fg-2">{bi(step.ko, step.en)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function FieldNoteArticle({ note }: { readonly note: EngineeringFieldNote }) {
  useBilingualI18nRevision();
  const Icon = FIELD_CATEGORY_ICONS[note.category];
  const category = ENGINEERING_FIELD_CATEGORY_META[note.category];
  return (
    <article
      id={note.id}
      data-engineering-field-note={note.category}
      data-engineering-field-note-id={note.id}
      className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-[0.64rem] font-black uppercase tracking-[0.15em] text-accent-2">{note.eyebrow}</p>
            <p className="mt-1 text-xs text-fg-3">{bi(category.label.ko, category.label.en)}</p>
          </div>
        </div>
        <EngineeringStatusBadge status={note.status} />
      </div>

      <h3 className="mt-5 max-w-5xl text-balance break-keep text-2xl font-black tracking-tight text-fg">{bi(note.title.ko, note.title.en)}</h3>
      <p className="mt-3 max-w-5xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">{bi(note.summary.ko, note.summary.en)}</p>

      <dl className="mt-6 grid gap-3 lg:grid-cols-3">
        {([
          ["problem", bi("문제", "Problem"), "text-bad", note.problem],
          ["pattern", bi("적용 패턴", "Pattern"), "text-accent", note.pattern],
          ["boundary", bi("경계와 한계", "Boundary"), "text-warn", note.boundary],
        ] as const).map(([key, label, tone, text]) => (
          <div key={key} className="rounded-3xl border border-line/65 bg-card/65 p-5">
            <dt className={`text-[0.66rem] font-black uppercase tracking-[0.14em] ${tone}`}>{label}</dt>
            <dd className="mt-2 text-sm leading-7 text-fg-2">{bi(text.ko, text.en)}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-5 flex flex-wrap gap-2" aria-label={bi("관련 기술", "Related technologies")}>
        {note.technologies.map((technology) => (
          <li key={technology} className="rounded-full border border-line bg-card px-3 py-1.5 font-display text-[0.67rem] font-semibold text-fg-2">{technology}</li>
        ))}
      </ul>

      <EngineeringDisclosure
        className="mt-6"
        summary={(
          <>
            <Wrench size={16} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{bi("적용 순서·코드 근거·공식 자료", "Reuse steps, code evidence and official sources")}</span>
          </>
        )}
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby={`${note.id}-reuse-title`}>
            <h4 id={`${note.id}-reuse-title`} className="text-sm font-black text-fg">{bi("다른 프로젝트 적용 순서", "Reuse sequence")}</h4>
            <ol className="mt-3 grid gap-2.5">
              {note.reuseSteps.map((step, index) => (
                <li key={step.en} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                  <span className="pt-0.5 text-xs leading-6 text-fg-2">{bi(step.ko, step.en)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby={`${note.id}-evidence-title`}>
            <h4 id={`${note.id}-evidence-title`} className="text-sm font-black text-fg">{bi("코드·테스트·공식 자료", "Code, tests and official sources")}</h4>
            <ul className="mt-3 grid gap-2.5">
              {note.evidence.map((item) => {
                const EvidenceIcon = EVIDENCE_ICONS[item.kind];
                return (
                  <li key={`${item.kind}-${item.path}`} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3">
                    <EvidenceIcon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-fg">{bi(item.label.ko, item.label.en)}</span>
                      <code className="eng-code mt-1 block overflow-x-auto whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[0.64rem]">{item.path}</code>
                    </span>
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
                    rel="noopener noreferrer"
                    className="group flex h-full min-h-14 items-start justify-between gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span>
                      {reference.title}
                      <span className="mt-1 block text-xs font-normal leading-5 text-fg-3">{bi(reference.note.ko, reference.note.en)}</span>
                    </span>
                    <ExternalLink size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </EngineeringDisclosure>
    </article>
  );
}

export function EngineeringFieldNotesPage() {
  useBilingualI18nRevision();

  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(getActiveI18nLocale());
  const notes = useMemo(() => {
    const candidates: readonly EngineeringFieldNote[] = filter === "all"
      ? ENGINEERING_FIELD_NOTES
      : ENGINEERING_FIELD_NOTES.filter((note) => note.category === filter);
    if (!normalizedQuery) return candidates;
    return candidates.filter((note) => [
      note.eyebrow,
      bi(note.title.ko, note.title.en),
      bi(note.summary.ko, note.summary.en),
      bi(note.problem.ko, note.problem.en),
      bi(note.pattern.ko, note.pattern.en),
      bi(note.boundary.ko, note.boundary.en),
      bi(ENGINEERING_FIELD_CATEGORY_META[note.category].label.ko, ENGINEERING_FIELD_CATEGORY_META[note.category].label.en),
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
    bi("ToonStudio 기술 심화 노트 · 깊은 구현 판단과 장애·교훈", "ToonStudio field notes · Deep implementation notes, incidents and lessons"),
  );

  const tocGroups: readonly EngineeringTocGroup[] = [
    {
      id: "notes-group",
      label: formatI18nTemplate(String(bi("심화 노트 {value0}개", "{value0} field notes")), { value0: notes.length }),
      items: notes.map((note, index) => ({
        id: note.id,
        label: bi(note.title.ko, note.title.en),
        marker: String(index + 1).padStart(2, "0"),
      })),
    },
    {
      id: "patterns-group",
      label: bi("실행 청사진과 데이터", "Blueprints and data"),
      items: [
        { id: "execution-blueprints", label: bi("Worker·PWA 실행 경계", "Worker and PWA boundaries") },
        { id: "open-api", label: bi("Open API 어댑터", "Open API adapters") },
      ],
    },
    {
      id: "incidents-group",
      items: [{ id: "incidents", label: formatI18nTemplate(String(bi("장애와 교훈 {value0}건", "{value0} incidents and lessons")), { value0: INCIDENTS.length }) }],
    },
  ];

  return (
    <EngineeringPageFrame pageId="field-notes">
      <EngineeringPageIntro
        pageId="field-notes"
        eyebrow="ENGINEERING FIELD NOTES"
        title={bi("실제 구현에서 남은 기술 판단과 실패 복구 과정을 더 깊게 공개합니다.", "Deeper implementation decisions and recovery lessons from the real product.")}
        description={bi(
          "Worker·PWA, 무료 우선 AI·인프라, Blender·3D, Open API의 깊은 기술 노트와, 실제로 겪은 장애를 증상부터 재발 방지까지 기록했습니다.",
          "Deep notes on Workers and PWA, free-first AI and infrastructure, Blender and 3D and Open APIs, plus real incidents traced from symptom to prevention.",
        )}
        aside={(
          <SectionArt
            image="explore"
            className="aspect-[16/10] w-full max-w-sm rounded-2xl border border-line object-cover"
          />
        )}
      />

      <EngineeringKeySummary
        points={[
          bi("각 노트는 문제 → 적용 패턴 → 경계와 한계 순서이며, 펼치면 다른 프로젝트 적용 순서와 코드 근거가 나옵니다.", "Each note reads problem → pattern → boundary; expand it for reuse steps and code evidence."),
          bi("장애 기록은 증상 → 원인 → 수정 → 재발 방지(또는 잘못된 접근 → 교훈)까지 잇고, 회귀 테스트 경로를 남깁니다.", "Incidents connect symptom → cause → fix → prevention (or wrong turn → lesson) with regression-test paths."),
          bi("구현 수치는 저장소를 직접 세어 확인하며, 값이 바뀌면 콘텐츠 계약 테스트가 실패합니다.", "Implementation figures are counted from the repository; content-contract tests fail when they drift."),
          bi("무료 티어·API 약관·브라우저 지원은 바뀔 수 있으니 도입 시 공식 문서를 다시 확인하세요.", "Free tiers, API terms and browser support change; recheck official docs before adopting."),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("노트 {value0}", "{value0} notes")), { value0: ENGINEERING_FIELD_NOTES.length })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("장애 기록 {value0}", "{value0} incidents")), { value0: INCIDENTS.length })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("검토일 {value0}", "Reviewed {value0}")), { value0: ENGINEERING_IMPLEMENTATION_INVENTORY.reviewedAt })}</EngineeringMetaChip>
          </>
        )}
      />

      <section className="mt-8" aria-labelledby="implementation-inventory-title">
        <h2 id="implementation-inventory-title" className="sr-only">{bi("저장소로 검증한 구현 수치", "Repository-verified implementation figures")}</h2>
        <ul className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {inventoryCards.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label} className="rounded-3xl border border-line/70 bg-card/65 p-4 shadow-sm">
                <Icon size={18} className="text-accent" aria-hidden="true" />
                <p className="mt-3 font-display text-3xl font-black tracking-tight text-fg">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-fg-3">{item.label}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <EngineeringLongformLayout groups={tocGroups} bodyId={BODY_ID} tocLabel={bi("심화 노트 목차", "Field notes contents")}>
        <div className="grid gap-14">
          <section aria-labelledby="field-note-list-title" className="grid gap-5">
            <h2 id="field-note-list-title" className="sr-only">{bi("심화 기술 노트", "Engineering field notes")}</h2>
            <div className="grid gap-4 rounded-3xl border border-line/70 bg-panel/55 p-3 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-end">
              <div>
                <label htmlFor="engineering-field-note-search" className="px-1 text-xs font-black text-fg">{bi("기술 노트 검색", "Search field notes")}</label>
                <div className="relative mt-2">
                  <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
                  <input
                    id="engineering-field-note-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={bi("예: Worker, MediaPipe, Blender, OPFS", "e.g. Worker, MediaPipe, Blender, OPFS")}
                    className="min-h-11 w-full rounded-2xl border border-line bg-card py-2 pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                </div>
                <p className="mt-2 px-1 text-[0.72rem] text-fg-3" role="status">
                  {formatI18nTemplate(String(bi("{value0}개 / 전체 {value1}개 노트", "{value0} of {value1} notes")), { value0: notes.length, value1: ENGINEERING_FIELD_NOTES.length })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={bi("노트 분야 필터", "Field-note category filter")}>
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
                        "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-accent",
                      )}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {bi(item.ko, item.en)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5" aria-live="polite">
              {notes.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-line-strong bg-card/45 p-8 text-center" role="status">
                  <Search size={22} className="mx-auto text-accent" aria-hidden="true" />
                  <p className="mt-4 font-black text-fg">{bi("검색 조건과 일치하는 기술 노트가 없습니다.", "No field notes match the current search.")}</p>
                  <p className="mt-2 text-sm leading-7 text-fg-3">{bi("검색어를 줄이거나 전체 분야를 선택해 보세요.", "Shorten the query or select all categories.")}</p>
                </div>
              ) : notes.map((note) => <FieldNoteArticle key={note.id} note={note} />)}
            </div>
          </section>

          <section id="execution-blueprints" aria-labelledby="worker-pwa-pattern-title" className="grid gap-5">
            <header className="grid gap-3">
              <p className="eyebrow text-accent">BROWSER EXECUTION BLUEPRINTS</p>
              <h2 id="worker-pwa-pattern-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bi("Worker와 PWA는 서로 다른 실패를 격리하는 두 개의 실행 계층입니다.", "Workers and PWA isolate two different classes of failure.")}
              </h2>
            </header>
            <div className="grid gap-4 xl:grid-cols-2">
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

          <section id="open-api" aria-labelledby="open-api-title" className="grid gap-5">
            <header className="grid gap-3">
              <p className="eyebrow text-accent">OPEN API ADAPTER MAP</p>
              <h2 id="open-api-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bi("Open API마다 데이터보다 먼저 권리·출처·실패 규칙을 정의했습니다.", "Rights, provenance and failure rules precede data for every Open API.")}
              </h2>
              <p className="max-w-4xl text-sm leading-7 text-fg-2">
                {bi("API가 공개되어 있다는 사실과 결과물을 다시 배포할 수 있다는 사실은 다릅니다. 제공처마다 다른 공개 이용 flag, 상세 조회, 이미지 호스트와 오류를 따로 검증합니다.", "Public API access does not automatically grant redistribution rights. Each adapter validates provider-specific rights flags, detail data, image hosts and errors independently.")}
              </p>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {ENGINEERING_OPEN_APIS.map((api) => (
                <article key={api.id} className="rounded-[1.75rem] border border-line/70 bg-panel/60 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-lg font-black text-fg">
                      <PlugZap size={18} className="text-accent" aria-hidden="true" />
                      {api.provider}
                    </h3>
                    <EngineeringStatusBadge status={api.status} />
                  </div>
                  <p className="mt-3 text-sm leading-7 text-fg-2">{bi(api.purpose.ko, api.purpose.en)}</p>
                  <EngineeringDisclosure className="mt-4" summary={<span>{bi("접근 계약·권리 확인·실패 복구", "Access, rights gate and recovery")}</span>}>
                    <dl className="grid gap-2.5 text-xs leading-6">
                      {([
                        [bi("접근 계약", "Access contract"), "text-fg", api.access],
                        [bi("권리 확인", "Rights gate"), "text-good", api.rightsGate],
                        [bi("실패·복구", "Failure and recovery"), "text-warn", api.resilience],
                      ] as const).map(([term, tone, value]) => (
                        <div key={term} className="rounded-2xl border border-line/65 bg-card/60 p-3.5">
                          <dt className={`font-black ${tone}`}>{term}</dt>
                          <dd className="mt-1 text-fg-2">{bi(value.ko, value.en)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 grid gap-2">
                      {api.evidence.map((item) => (
                        <code key={item.path} className="eng-code block overflow-x-auto whitespace-nowrap rounded-xl px-3 py-2 font-mono text-[0.63rem]">{item.path}</code>
                      ))}
                    </div>
                  </EngineeringDisclosure>
                  <a
                    href={api.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {bi("공식 API 문서", "Official API documentation")}
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section id="incidents" aria-labelledby="troubleshooting-title" className="grid gap-5">
            <header className="grid gap-3">
              <p className="eyebrow text-accent">INCIDENTS · LESSONS</p>
              <h2 id="troubleshooting-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {bi("실패를 숨기지 않고 재현 가능한 회귀 계약으로 바꾼 사례", "Failures converted into reproducible regression contracts")}
              </h2>
              <p className="max-w-4xl text-sm leading-7 text-fg-2">
                {bi(
                  "단순 해결 팁이 아니라 같은 장애가 다시 생기지 않게 만든 코드와 테스트까지 기록합니다. 일부 기록은 처음 세운 잘못된 가설과 거기서 얻은 교훈도 함께 남깁니다.",
                  "Each record includes the code or test that keeps the incident from returning; some also keep the wrong first hypothesis and the lesson learned.",
                )}
              </p>
            </header>
            <div className="grid gap-3">
              {INCIDENTS.map((incident, index) => (
                <EngineeringIncidentCard key={incident.id} incident={incident} index={index} />
              ))}
            </div>
          </section>

          <aside className="flex items-start gap-4 rounded-[2rem] border border-accent/25 bg-accent-soft/20 p-6" role="note">
            <ShieldCheck size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="font-black text-fg">{bi("참고한 제품과 채택 경계는 참고 자료로 옮겼습니다.", "Reference products and adoption boundaries moved to References.")}</p>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-fg-2">
                {formatI18nTemplate(String(bi(
                  "이 페이지는 {value0} 저장소 구현과 공식 자료를 기준으로 합니다. 실제 도입 시 공식 문서·라이선스·가격·브라우저 호환성을 다시 확인하세요.",
                  "This page reflects repository implementation and official material reviewed on {value0}; recheck docs, licenses, pricing and compatibility before adopting.",
                )), { value0: ENGINEERING_IMPLEMENTATION_INVENTORY.reviewedAt })}
              </p>
              <Link
                href="/about/technology/references#reference-products"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:underline"
              >
                {bi("참고한 제품 보기", "See reference products")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </EngineeringLongformLayout>
    </EngineeringPageFrame>
  );
}
