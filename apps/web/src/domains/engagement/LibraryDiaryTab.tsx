import { BookOpenCheck, CalendarDays, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { useEngagement, type ReadingDiaryInput } from "./engagement-store";
import type { ReadingMood } from "./engagement-model";

import type { PlatformId, Title } from "@/shared/lib/types";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApp } from "@/shared/lib/store";
import { PLATFORMS } from "@/shared/lib/platforms";
import { cn } from "@/shared/lib/utils";

const MOODS: readonly { value: ReadingMood; label: string }[] = [
  { value: "excited", label: "신남" },
  { value: "moved", label: "감동" },
  { value: "comforted", label: "힐링" },
  { value: "curious", label: "궁금" },
  { value: "tense", label: "긴장" },
  { value: "mixed", label: "복합" },
];

function localDateInput(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateIso(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function diaryDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date)
    : value;
}

export function LibraryDiaryTab({ titlesById }: { readonly titlesById: Readonly<Record<string, Title>> }) {
  const diaryEntries = useEngagement((state) => state.diaryEntries);
  const saveDiaryEntry = useEngagement((state) => state.saveDiaryEntry);
  const deleteDiaryEntry = useEngagement((state) => state.deleteDiaryEntry);
  const setRead = useApp((state) => state.setRead);
  const titles = useMemo(() => Object.values(titlesById)
    .sort((left, right) => left.title.localeCompare(right.title, "ko-KR")), [titlesById]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleId, setTitleId] = useState("");
  const [episode, setEpisode] = useState("");
  const [readAt, setReadAt] = useState(localDateInput);
  const [mood, setMood] = useState<ReadingMood>("curious");
  const [note, setNote] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [reread, setReread] = useState(false);
  const [platformId, setPlatformId] = useState<PlatformId | "">("");
  const selectedTitle = titleId ? titlesById[titleId] : undefined;

  const reset = () => {
    setEditingId(null);
    setTitleId("");
    setEpisode("");
    setReadAt(localDateInput());
    setMood("curious");
    setNote("");
    setSpoiler(false);
    setReread(false);
    setPlatformId("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTitle) return;
    const parsedEpisode = Number(episode);
    const totalEpisodes = selectedTitle.totalEpisodes ?? null;
    const input: ReadingDiaryInput = {
      id: editingId ?? undefined,
      titleId: selectedTitle.id,
      episode: Number.isSafeInteger(parsedEpisode) && parsedEpisode > 0 ? parsedEpisode : null,
      totalEpisodes,
      readAt: dateIso(readAt),
      mood,
      note,
      spoiler,
      reread,
      platformId: platformId || null,
    };
    const saved = saveDiaryEntry(input);
    if (!saved) return;
    if (input.episode && totalEpisodes && input.episode >= totalEpisodes) setRead(selectedTitle.id, "done");
    else setRead(selectedTitle.id, "reading");
    reset();
  };

  const edit = (entry: (typeof diaryEntries)[number]) => {
    setEditingId(entry.id);
    setTitleId(entry.titleId);
    setEpisode(entry.episode ? String(entry.episode) : "");
    setReadAt(localDateInput(new Date(entry.readAt)));
    setMood(entry.mood);
    setNote(entry.note);
    setSpoiler(entry.spoiler);
    setReread(entry.reread);
    setPlatformId(entry.platformId ?? "");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <form onSubmit={submit} className="rounded-3xl border border-line bg-card p-5 xl:sticky xl:top-[var(--site-header-sticky-offset,5rem)] xl:self-start">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <BookOpenCheck size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-black text-fg">{editingId ? "감상 기록 수정" : "오늘의 감상 기록"}</h2>
            <p className="text-[0.68rem] text-fg-3">회차와 감정을 남겨 다음에 이어 보세요.</p>
          </div>
        </div>

        <label className="mt-5 block text-xs font-bold text-fg-2">
          작품
          <select
            required
            value={titleId}
            onChange={(event) => {
              setTitleId(event.target.value);
              setPlatformId("");
            }}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
          >
            <option value="">작품 선택</option>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.title}</option>)}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-fg-2">
            읽은 회차
            <input
              type="number"
              min="1"
              max={selectedTitle?.totalEpisodes ?? 100_000}
              value={episode}
              onChange={(event) => setEpisode(event.target.value)}
              placeholder={selectedTitle?.totalEpisodes ? `전체 ${selectedTitle.totalEpisodes}` : "선택"}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            읽은 날
            <input
              type="date"
              required
              value={readAt}
              onChange={(event) => setReadAt(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            />
          </label>
        </div>

        {selectedTitle?.availability.length ? (
          <label className="mt-3 block text-xs font-bold text-fg-2">
            이용한 플랫폼
            <select
              value={platformId}
              onChange={(event) => setPlatformId(event.target.value as PlatformId | "")}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            >
              <option value="">기록하지 않음</option>
              {selectedTitle.availability.map((item) => (
                <option key={item.platformId} value={item.platformId}>
                  {PLATFORMS[item.platformId]?.name ?? item.platformId}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <fieldset className="mt-4">
          <legend className="text-xs font-bold text-fg-2">오늘의 감정</legend>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {MOODS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={mood === item.value}
                onClick={() => setMood(item.value)}
                className={cn(
                  "min-h-9 rounded-lg border text-xs font-bold",
                  mood === item.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-3",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-xs font-bold text-fg-2">
          메모
          <textarea
            maxLength={2_000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="좋았던 장면, 다음에 이어 볼 지점, 떠오른 생각"
            className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-6 text-fg"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-fg-2">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={spoiler} onChange={(event) => setSpoiler(event.target.checked)} /> 스포일러 포함</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={reread} onChange={(event) => setReread(event.target.checked)} /> 재독</label>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!selectedTitle} className={buttonClass({ className: "flex-1 gap-1.5" })}>
            <Plus size={15} aria-hidden="true" /> {editingId ? "수정 저장" : "기록 저장"}
          </button>
          {editingId ? (
            <button type="button" onClick={reset} className={buttonClass({ variant: "outline", className: "gap-1.5" })}>
              <RotateCcw size={14} aria-hidden="true" /> 취소
            </button>
          ) : null}
        </div>
      </form>

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">READING DIARY</p>
            <h2 className="mt-1 text-xl font-black text-fg">감상 일기 {diaryEntries.length}</h2>
          </div>
          <p className="hidden max-w-md text-right text-xs leading-5 text-fg-3 sm:block">기록은 내 서재 데이터와 별도로 보관되며, 스포일러 메모는 공개 리스트에 포함되지 않습니다.</p>
        </div>

        {diaryEntries.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-line bg-card/50 p-10 text-center">
            <CalendarDays className="mx-auto size-9 text-fg-3" aria-hidden="true" />
            <h3 className="mt-3 font-black text-fg">첫 감상을 기록해 보세요</h3>
            <p className="mt-1 text-sm text-fg-3">현재 회차를 남기면 다음 방문에 이어 보기 쉽습니다.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {[...diaryEntries]
              .sort((left, right) => Date.parse(right.readAt) - Date.parse(left.readAt))
              .map((entry) => {
                const title = titlesById[entry.titleId];
                const platform = entry.platformId ? PLATFORMS[entry.platformId]?.name : null;
                const moodLabel = MOODS.find((item) => item.value === entry.mood)?.label ?? entry.mood;
                return (
                  <article key={entry.id} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
                          <time dateTime={entry.readAt}>{diaryDate(entry.readAt)}</time>
                          <span className="rounded-full border border-line bg-panel px-2 py-0.5">{moodLabel}</span>
                          {entry.reread ? <span className="rounded-full border border-cool/30 bg-cool/10 px-2 py-0.5 text-cool">재독</span> : null}
                          {entry.spoiler ? <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-warn">스포일러</span> : null}
                        </div>
                        <h3 className="mt-2 truncate text-base font-black text-fg">{title?.title ?? "불러올 수 없는 작품"}</h3>
                        <p className="mt-1 text-xs text-fg-3">
                          {entry.episode ? `${entry.episode}화` : "회차 미기록"}
                          {entry.totalEpisodes ? ` / ${entry.totalEpisodes}화` : ""}
                          {platform ? ` · ${platform}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => edit(entry)} aria-label="감상 기록 수정" className="grid size-9 place-items-center rounded-lg border border-line text-fg-3 hover:text-fg"><Pencil size={14} aria-hidden="true" /></button>
                        <button type="button" onClick={() => deleteDiaryEntry(entry.id)} aria-label="감상 기록 삭제" className="grid size-9 place-items-center rounded-lg border border-line text-fg-3 hover:border-bad/40 hover:text-bad"><Trash2 size={14} aria-hidden="true" /></button>
                      </div>
                    </div>
                    {entry.note ? (
                      <p className={cn("mt-4 whitespace-pre-wrap rounded-xl bg-panel p-3 text-sm leading-6 text-fg-2", entry.spoiler && "border border-warn/20")}>{entry.note}</p>
                    ) : null}
                  </article>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
