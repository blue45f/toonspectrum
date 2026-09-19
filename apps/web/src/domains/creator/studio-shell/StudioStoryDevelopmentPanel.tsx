import { BookOpenText, Download, FilePlus2, PanelTopOpen, Trash2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  buildStudioStoryAdaptationPlan,
  buildWriterRoomFromStoryAdaptation,
  createStudioStoryDevelopmentDocument,
  storyDevelopmentStorageKey,
  type StudioStoryChapter,
  type StudioStoryDevelopmentDocument,
} from "../studio-story-adaptation";
import { serializeStudioWriterRoomDocument } from "../studio-writer-room";
import type { StudioStoryBeat } from "../studio-storyboard-planner";

const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function normalizeStored(value: unknown): StudioStoryDevelopmentDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioStoryDevelopmentDocument>;
  if (candidate.version !== 1 || !Array.isArray(candidate.chapters)) return null;
  const chapters: StudioStoryChapter[] = candidate.chapters
    .slice(0, 100)
    .filter((item): item is StudioStoryChapter => Boolean(
      item
      && typeof item.id === "string"
      && typeof item.title === "string"
      && typeof item.body === "string"
      && ["draft", "review", "locked"].includes(item.status),
    ))
    .map((item) => ({
      id: item.id.slice(0, 120),
      title: item.title.slice(0, 240),
      body: item.body.slice(0, 120_000),
      status: item.status,
    }));
  if (chapters.length === 0) return null;
  return {
    version: 1,
    sourceKind: ["web-novel", "webtoon-script", "original"].includes(candidate.sourceKind ?? "")
      ? candidate.sourceKind as StudioStoryDevelopmentDocument["sourceKind"]
      : "web-novel",
    title: String(candidate.title ?? "").slice(0, 240),
    logline: String(candidate.logline ?? "").slice(0, 1_000),
    synopsis: String(candidate.synopsis ?? "").slice(0, 12_000),
    chapters,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
  };
}

function loadDevelopment(projectId: string): StudioStoryDevelopmentDocument {
  if (typeof window === "undefined") return createStudioStoryDevelopmentDocument();
  try {
    const raw = window.localStorage.getItem(storyDevelopmentStorageKey(projectId));
    return raw ? normalizeStored(JSON.parse(raw)) ?? createStudioStoryDevelopmentDocument() : createStudioStoryDevelopmentDocument();
  } catch {
    return createStudioStoryDevelopmentDocument();
  }
}

function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function StudioStoryDevelopmentPanel({
  projectId,
  onApplyBeats,
}: {
  readonly projectId: string;
  readonly onApplyBeats: (beats: readonly StudioStoryBeat[], mode: "replace" | "append") => void;
}) {
  const bt = useBilingual("StudioStoryDevelopmentPanel");
  const [development, setDevelopment] = useState(() => loadDevelopment(projectId));
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  const [selectedChapterId, setSelectedChapterId] = useState(() => development.chapters[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const next = loadDevelopment(projectId);
    setDevelopment(next);
    setLoadedProjectId(projectId);
    setSelectedChapterId(next.chapters[0]?.id ?? "");
  }, [projectId]);

  useEffect(() => {
    // Never write the previous project state during the scope-change render.
    if (loadedProjectId !== projectId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storyDevelopmentStorageKey(projectId), JSON.stringify(development));
    } catch {
      // The editor remains usable when storage is unavailable; only persistence is lost.
    }
  }, [development, projectId, loadedProjectId]);

  const chapter = development.chapters.find((item) => item.id === selectedChapterId)
    ?? development.chapters[0]!;
  const plan = useMemo(() => buildStudioStoryAdaptationPlan(chapter.body), [chapter.body]);

  const patchDevelopment = (patch: Partial<StudioStoryDevelopmentDocument>) => {
    setDevelopment((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    setNotice(null);
  };
  const patchChapter = (patch: Partial<StudioStoryChapter>) => {
    setDevelopment((current) => ({
      ...current,
      chapters: current.chapters.map((item) => item.id === chapter.id ? { ...item, ...patch } : item),
      updatedAt: new Date().toISOString(),
    }));
    setNotice(null);
  };

  const addChapter = () => {
    const index = development.chapters.length + 1;
    const next: StudioStoryChapter = {
      id: `chapter-${Date.now().toString(36)}`,
      title: bt(`${index}화`, `Chapter ${index}`),
      body: "",
      status: "draft",
    };
    patchDevelopment({ chapters: [...development.chapters, next] });
    setSelectedChapterId(next.id);
  };

  const removeChapter = () => {
    if (development.chapters.length <= 1) return;
    const remaining = development.chapters.filter((item) => item.id !== chapter.id);
    patchDevelopment({ chapters: remaining });
    setSelectedChapterId(remaining[0]?.id ?? "");
  };

  const apply = (mode: "replace" | "append") => {
    if (plan.beats.length === 0) return;
    onApplyBeats(plan.beats, mode);
    setNotice(mode === "replace"
      ? bt("현재 프로젝트 컷 계획을 이 변환 초안으로 교체했습니다.", "Replaced the project beat plan with this adaptation draft.")
      : bt("현재 프로젝트 컷 계획 뒤에 변환 초안을 추가했습니다.", "Appended the adaptation draft to the project beat plan."));
  };

  const exportWriterRoom = () => {
    if (plan.beats.length === 0) return;
    const writerRoom = buildWriterRoomFromStoryAdaptation({ development, plan });
    downloadText(
      `${(development.title || chapter.title || "story").replace(/[^a-z0-9가-힣_-]+/giu, "-")}-writer-room.json`,
      serializeStudioWriterRoomDocument(writerRoom),
    );
    setNotice(bt("Writer Room 호환 JSON을 내보냈습니다.", "Exported a Writer Room compatible JSON file."));
  };

  return (
    <section className="rounded-3xl border border-accent/25 bg-card p-4 shadow-sm sm:p-6" aria-labelledby="story-development-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <BookOpenText size={15} aria-hidden="true" /> STORY / WEB NOVEL LAB
          </p>
          <h2 id="story-development-title" className="mt-2 text-xl font-black text-fg">
            {bt("웹소설·시놉시스에서 웹툰 컷 계획까지", "From web novel and synopsis to webtoon panel plan")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {bt(
              "회차 원문은 프로젝트에 보관하고, 변환 초안은 장면·비트·대사·컷 예상치로 분석합니다. 적용 전까지 기존 스토리 계획은 바뀌지 않습니다.",
              "Keep chapter drafts with the project and analyze an adaptation into scenes, beats, dialogue and panel estimates. Existing story planning stays unchanged until you apply it.",
            )}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center rounded-full border border-accent/30 bg-accent-soft px-3 text-xs font-bold text-accent">
          {bt("로컬 초안 · 원본 보호", "Local draft · original protected")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <label className="text-xs font-bold text-fg-2">
          {bt("원천 형식", "Source format")}
          <select className={`${FIELD} mt-1`} value={development.sourceKind} onChange={(event) => patchDevelopment({ sourceKind: event.target.value as StudioStoryDevelopmentDocument["sourceKind"] })}>
            <option value="web-novel">{bt("웹소설", "Web novel")}</option>
            <option value="webtoon-script">{bt("웹툰 대본", "Webtoon script")}</option>
            <option value="original">{bt("오리지널 기획", "Original concept")}</option>
          </select>
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-2">
          {bt("작품명", "Project title")}
          <input className={`${FIELD} mt-1`} value={development.title} maxLength={240} onChange={(event) => patchDevelopment({ title: event.target.value })} />
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-3">
          {bt("한 줄 소개", "Logline")}
          <input className={`${FIELD} mt-1`} value={development.logline} maxLength={1000} onChange={(event) => patchDevelopment({ logline: event.target.value })} placeholder={bt("주인공·목표·갈등을 한 문장으로", "One sentence covering protagonist, goal and conflict")} />
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-3">
          {bt("시놉시스", "Synopsis")}
          <textarea className={cn(FIELD, "mt-1 min-h-28 resize-y")} value={development.synopsis} maxLength={12000} onChange={(event) => patchDevelopment({ synopsis: event.target.value })} placeholder={bt("전체 줄거리, 핵심 반전, 결말 방향을 정리하세요.", "Summarize the arc, major turns and ending direction.")} />
        </label>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm text-fg">{bt("회차", "Chapters")}</b>
            <button type="button" onClick={addChapter} className={buttonClass({ variant: "quiet", size: "icon" })} aria-label={bt("회차 추가", "Add chapter")}>
              <FilePlus2 size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 space-y-1">
            {development.chapters.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedChapterId(item.id)} className={cn(
                "min-h-11 w-full rounded-xl border px-3 text-left text-xs font-bold",
                item.id === chapter.id ? "border-accent bg-accent-soft text-accent" : "border-transparent text-fg-2 hover:bg-raised",
              )}>
                <span className="block truncate">{item.title || bt("제목 없음", "Untitled")}</span>
                <span className="mt-0.5 block text-[0.65rem] font-medium opacity-70">{item.status} · {item.body.length.toLocaleString()} chars</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <input className={FIELD} value={chapter.title} maxLength={240} onChange={(event) => patchChapter({ title: event.target.value })} aria-label={bt("회차 제목", "Chapter title")} />
            <select className={FIELD} value={chapter.status} onChange={(event) => patchChapter({ status: event.target.value as StudioStoryChapter["status"] })} aria-label={bt("회차 상태", "Chapter status")}>
              <option value="draft">{bt("초안", "Draft")}</option>
              <option value="review">{bt("검토", "Review")}</option>
              <option value="locked">{bt("확정", "Locked")}</option>
            </select>
            <button type="button" disabled={development.chapters.length <= 1} onClick={removeChapter} className={buttonClass({ variant: "quiet", size: "icon" })} aria-label={bt("회차 삭제", "Delete chapter")}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <textarea
            className={cn(FIELD, "mt-2 min-h-64 resize-y font-serif leading-7")}
            value={chapter.body}
            maxLength={120000}
            onChange={(event) => patchChapter({ body: event.target.value })}
            placeholder={bt("웹소설 본문 또는 웹툰으로 전환할 대본을 붙여 넣으세요.", "Paste the web-novel chapter or script you want to adapt.")}
          />

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              [bt("원문", "Source"), chapter.body.length.toLocaleString()],
              [bt("장면", "Scenes"), plan.scenes.length],
              [bt("스토리 비트", "Story beats"), plan.beats.length],
              [bt("예상 컷", "Est. panels"), plan.estimatedPanels],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-panel p-3">
                <p className="text-[0.65rem] font-bold text-fg-3">{label}</p>
                <b className="mt-1 block text-lg text-fg">{value}</b>
              </div>
            ))}
          </div>

          {plan.warnings.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-warning">
              {bt("자동 변환 확인 항목", "Adaptation review")}: {plan.warnings.slice(0, 5).join(", ")}
            </p>
          ) : null}
          {notice ? <p role="status" className="mt-3 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-xs font-semibold text-success">{notice}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={plan.beats.length === 0} onClick={() => apply("replace")} className={buttonClass({ className: "gap-2" })}>
              <WandSparkles size={16} aria-hidden="true" /> {bt("컷 계획으로 적용", "Apply as panel plan")}
            </button>
            <button type="button" disabled={plan.beats.length === 0} onClick={() => apply("append")} className={buttonClass({ variant: "outline", className: "gap-2" })}>
              <PanelTopOpen size={16} aria-hidden="true" /> {bt("기존 계획 뒤에 추가", "Append to current plan")}
            </button>
            <button type="button" disabled={plan.beats.length === 0} onClick={exportWriterRoom} className={buttonClass({ variant: "quiet", className: "gap-2" })}>
              <Download size={16} aria-hidden="true" /> {bt("Writer Room JSON", "Writer Room JSON")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
