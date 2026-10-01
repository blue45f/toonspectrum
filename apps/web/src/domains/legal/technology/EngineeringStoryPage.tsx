import {
  CheckCircle2,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  ListChecks,
  TestTube2,
  Workflow,
} from "lucide-react";

import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  ENGINEERING_STATUS_META,
  type EngineeringChapter,
  type EngineeringEvidenceKind,
  type EngineeringStatus,
} from "./engineering-story-content";
import { ENGINEERING_STORY_GROUPS } from "./engineering-story-groups";
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

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringStoryPage", ko, en);

const BODY_ID = "engineering-story-body";

const EVIDENCE_ICONS: Record<EngineeringEvidenceKind, typeof Code2> = {
  code: FileCode2,
  test: TestTube2,
  workflow: Workflow,
  document: FileText,
};

const LEGEND_STATUSES: readonly EngineeringStatus[] = ["live", "configured", "experimental", "documented"];

const chapterById = new Map<string, EngineeringChapter>(
  PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

/** 그룹 순서대로 정렬한 챕터와 읽기 번호(01~). */
const STORY_SECTIONS = (() => {
  let position = 0;
  return ENGINEERING_STORY_GROUPS.map((group) => ({
    group,
    chapters: group.chapterIds.flatMap((id) => {
      const chapter = chapterById.get(id);
      if (!chapter) return [];
      position += 1;
      return [{ chapter, position }];
    }),
  }));
})();

function stripOrder(eyebrow: string): string {
  return eyebrow.replace(/^\d+\s·\s/u, "");
}

function StoryChapter({ chapter, position }: { readonly chapter: EngineeringChapter; readonly position: number }) {
  useBilingualI18nRevision();
  const marker = String(position).padStart(2, "0");
  return (
    <article id={chapter.id} className="scroll-mt-32 rounded-[2rem] border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent-2">
          {marker} · {stripOrder(chapter.eyebrow)}
        </p>
        <EngineeringStatusBadge status={chapter.status} />
      </div>
      <h3 className="mt-4 text-balance break-keep text-2xl font-black tracking-tight text-fg">{bi(chapter.title.ko, chapter.title.en)}</h3>
      <p className="mt-3 max-w-4xl text-base leading-8 text-fg-2">{bi(chapter.thesis.ko, chapter.thesis.en)}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={bi("관련 기술", "Related technologies")}>
        {chapter.technologies.map((technology) => (
          <li key={technology} className="rounded-full border border-line bg-card/75 px-3 py-1.5 font-display text-[0.68rem] font-semibold text-fg-2">
            {technology}
          </li>
        ))}
      </ul>

      <EngineeringDisclosure
        className="mt-6"
        summary={(
          <>
            <GitBranch size={17} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{bi("문제·선택·가치·대가와 근거", "Problem, decision, value, trade-off and evidence")}</span>
          </>
        )}
      >
        <dl className="grid gap-3 md:grid-cols-2">
          {([
            ["problem", bi("문제", "Problem"), "text-bad", chapter.problem],
            ["decision", bi("선택", "Decision"), "text-accent", chapter.decision],
            ["value", bi("사용자 가치", "User value"), "text-good", chapter.userValue],
            ["tradeoff", bi("대가와 한계", "Trade-off"), "text-warn", chapter.tradeoff],
          ] as const).map(([key, label, tone, text]) => (
            <div key={key} className="rounded-3xl border border-line/65 bg-card/65 p-5">
              <dt className={`font-display text-[0.66rem] font-black uppercase tracking-[0.15em] ${tone}`}>{label}</dt>
              <dd className="mt-3 text-sm leading-7 text-fg-2">{bi(text.ko, text.en)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby={`${chapter.id}-evidence-title`}>
            <h4 id={`${chapter.id}-evidence-title`} className="flex items-center gap-2 text-sm font-black text-fg">
              <Code2 size={15} className="text-accent" aria-hidden="true" />
              {bi("확인 가능한 근거", "Inspectable evidence")}
            </h4>
            <ul className="mt-3 grid gap-2.5">
              {chapter.evidence.map((item) => {
                const Icon = EVIDENCE_ICONS[item.kind];
                return (
                  <li key={`${item.kind}-${item.path}`} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-fg">{bi(item.label.ko, item.label.en)}</span>
                      <code className="eng-code mt-1.5 block overflow-x-auto whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[0.68rem]">{item.path}</code>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section aria-labelledby={`${chapter.id}-reuse-title`}>
            <h4 id={`${chapter.id}-reuse-title`} className="flex items-center gap-2 text-sm font-black text-fg">
              <ListChecks size={15} className="text-accent" aria-hidden="true" />
              {bi("다른 프로젝트에 적용", "Apply in another project")}
            </h4>
            <ol className="mt-3 grid gap-2.5">
              {chapter.reuseSteps.map((step, index) => (
                <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-3.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                  <span className="pt-0.5 text-xs leading-6 text-fg-2">{bi(step.ko, step.en)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </EngineeringDisclosure>
    </article>
  );
}

export function EngineeringStoryPage() {
  useBilingualI18nRevision();

  useDocumentTitle(
    bi("ToonStudio 제작 스토리 · 왜·어떻게 만들었나", "ToonStudio engineering story · Why and how it was built"),
  );

  const tocGroups: readonly EngineeringTocGroup[] = STORY_SECTIONS.map(({ group, chapters }) => ({
    id: group.id,
    label: bi(group.title.ko, group.title.en),
    items: chapters.map(({ chapter, position }) => ({
      id: chapter.id,
      label: bi(chapter.title.ko, chapter.title.en),
      marker: String(position).padStart(2, "0"),
    })),
  }));

  return (
    <EngineeringPageFrame pageId="story">
      <EngineeringPageIntro
        pageId="story"
        eyebrow={formatI18nTemplate("ENGINEERING STORY · {value0} CHAPTERS", { value0: PUBLISHED_ENGINEERING_CHAPTERS.length })}
        title={bi("기술 이름이 아니라, 문제와 판단의 순서로 설명합니다.", "The story follows problems and decisions, not a list of technology names.")}
        description={bi(
          "왜·어떻게 만들었는지를 문제 → 선택 → 사용자 가치 → 대가 순서로 읽습니다. 펼치면 코드·테스트 근거와 다른 프로젝트에 옮기는 순서가 나옵니다.",
          "Read why and how it was built in the order problem → decision → user value → trade-off. Expand a chapter for code and test evidence and a reuse sequence.",
        )}
      />

      <EngineeringKeySummary
        points={[
          bi("브라우저 한 곳에서 기획·드로잉·3D·협업·AI·발행이 이어지도록 제작 맥락을 연결했습니다.", "Planning, drawing, 3D, collaboration, AI and publishing stay connected in one browser workspace."),
          bi("원칙은 하나입니다. 데이터마다 권위를 하나로 둡니다(작품 원본은 기기, 원장은 서버, 실시간은 엣지).", "One principle: each kind of data has one authority (sources on the device, ledgers on the server, realtime at the edge)."),
          bi("챕터는 주제별 여덟 묶음으로 정리했고, 왼쪽 목차가 지금 읽는 위치를 따라갑니다.", "Chapters are grouped into eight themes, and the table of contents follows your position."),
          bi("상태 배지로 운영 중·설정 필요·실험·문서화를 구분하며, 실험을 운영 기능처럼 말하지 않습니다.", "Status badges separate live, configured, experimental and documented work; experiments are never presented as live."),
        ]}
        meta={(
          <>
            {LEGEND_STATUSES.map((status) => (
              <EngineeringStatusBadge key={status} status={status} className="min-h-6" />
            ))}
            <EngineeringMetaChip>
              {formatI18nTemplate(String(bi("{value0}개 챕터", "{value0} chapters")), { value0: PUBLISHED_ENGINEERING_CHAPTERS.length })}
            </EngineeringMetaChip>
          </>
        )}
      />

      <EngineeringLongformLayout groups={tocGroups} bodyId={BODY_ID} tocLabel={bi("기술 스토리 목차", "Engineering story table of contents")}>
        <div className="grid gap-12">
          {STORY_SECTIONS.map(({ group, chapters }) => (
            <section key={group.id} id={`story-group-${group.id}`} aria-labelledby={`story-group-${group.id}-title`} className="grid gap-4">
              <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line/70 pb-3">
                <h2 id={`story-group-${group.id}-title`} className="text-xl font-black tracking-tight text-fg sm:text-2xl">
                  {bi(group.title.ko, group.title.en)}
                </h2>
                <p className="text-sm text-fg-3">{bi(group.intro.ko, group.intro.en)}</p>
              </header>
              {chapters.map(({ chapter, position }) => (
                <StoryChapter key={chapter.id} chapter={chapter} position={position} />
              ))}
            </section>
          ))}
        </div>
        <aside className="mt-10 rounded-3xl border border-accent/25 bg-accent-soft/20 p-5" aria-labelledby="story-status-guide-title">
          <h2 id="story-status-guide-title" className="flex items-center gap-2 text-sm font-black text-fg">
            <CheckCircle2 size={18} className="text-accent" aria-hidden="true" />
            {bi("상태 배지 읽는 법", "How to read status badges")}
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {LEGEND_STATUSES.map((status) => (
              <div key={status} className="grid gap-1.5">
                <dt><EngineeringStatusBadge status={status} /></dt>
                <dd className="text-xs leading-6 text-fg-2">{bi(ENGINEERING_STATUS_META[status].description.ko, ENGINEERING_STATUS_META[status].description.en)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </EngineeringLongformLayout>
    </EngineeringPageFrame>
  );
}
