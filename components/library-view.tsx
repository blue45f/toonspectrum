"use client";

import { useState } from "react";
import Link from "next/link";
import { TITLES, getTitle } from "@/lib/data";
import { buildTasteProfile, recommendForTaste } from "@/lib/recommend";
import { useApp, useHydrated } from "@/lib/store";
import type { ReadState } from "@/lib/types";
import { UnderlineTabs, Segmented } from "./ui/segmented";
import { TitleCard } from "./title-card";
import { MiniPoster } from "./rank-row";
import { Stars } from "./ui/stars";
import { MeterBar } from "./ui/spectrum-bar";
import { genreColor, spectrumGradient } from "@/lib/genre-color";
import { cn } from "@/lib/utils";
import { Sparkles, Plus, Trash2, BookHeart, Star, Compass, FolderHeart } from "lucide-react";

type Tab = "shelf" | "rated" | "taste" | "collections";
const READ_TABS: { value: ReadState; label: string }[] = [
  { value: "want", label: "관심" },
  { value: "reading", label: "보는 중" },
  { value: "done", label: "완독" },
  { value: "dropped", label: "하차" },
];

function EmptyTeach({
  icon: Icon,
  title,
  desc,
  cta,
}: {
  icon: typeof Star;
  title: string;
  desc: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-card/40 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-raised text-fg-3">
        <Icon size={22} />
      </div>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        <p className="mt-1 max-w-xs text-sm text-fg-3">{desc}</p>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function LibraryView({ initialTab = "shelf" }: { initialTab?: Tab }) {
  const hydrated = useHydrated();
  const reads = useApp((s) => s.reads);
  const ratings = useApp((s) => s.ratings);
  const collections = useApp((s) => s.collections);
  const createCollection = useApp((s) => s.createCollection);
  const deleteCollection = useApp((s) => s.deleteCollection);
  const resetAll = useApp((s) => s.resetAll);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [readTab, setReadTab] = useState<ReadState>("want");

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }

  const readIds = Object.entries(reads);
  const ratedIds = Object.entries(ratings).sort((a, b) => b[1] - a[1]);
  const seen = new Set([...Object.keys(reads), ...Object.keys(ratings)]);
  const profile = buildTasteProfile(TITLES, ratings, reads);
  const recs = recommendForTaste(TITLES, profile, seen, 10);

  const counts: Record<ReadState, number> = { want: 0, reading: 0, done: 0, dropped: 0 };
  readIds.forEach(([, st]) => (counts[st] = (counts[st] ?? 0) + 1));
  const shelfTitles = readIds.filter(([, st]) => st === readTab).map(([id]) => getTitle(id)!).filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <UnderlineTabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { value: "shelf", label: `서재 ${readIds.length || ""}`.trim() },
          { value: "rated", label: `평가 ${ratedIds.length || ""}`.trim() },
          { value: "taste", label: "취향 분석" },
          { value: "collections", label: "컬렉션" },
        ]}
      />

      {/* 서재 */}
      {tab === "shelf" && (
        <div className="flex flex-col gap-5">
          <Segmented
            value={readTab}
            onChange={setReadTab}
            items={READ_TABS.map((t) => ({
              value: t.value,
              label: `${t.label}${counts[t.value] ? ` ${counts[t.value]}` : ""}`,
            }))}
          />
          {shelfTitles.length === 0 ? (
            <EmptyTeach
              icon={BookHeart}
              title="아직 담은 작품이 없어요"
              desc="작품 카드의 북마크나 상세 페이지의 상태 버튼으로 서재를 채워보세요."
              cta={{ label: "작품 탐색하기", href: "/explore" }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {shelfTitles.map((t) => (
                <TitleCard key={t.id} title={t} size="sm" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 내 평가 */}
      {tab === "rated" && (
        <div>
          {ratedIds.length === 0 ? (
            <EmptyTeach
              icon={Star}
              title="평가한 작품이 없어요"
              desc="별점을 남기면 취향 분석과 추천이 정교해집니다."
              cta={{ label: "평가하러 가기", href: "/ranking" }}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {ratedIds.map(([id, r]) => {
                const t = getTitle(id);
                if (!t) return null;
                return (
                  <Link
                    key={id}
                    href={`/title/${t.slug}`}
                    className="group flex items-center gap-4 rounded-xl border border-line bg-card p-3 transition-colors hover:border-line-strong"
                  >
                    <MiniPoster title={t} className="w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg group-hover:text-accent">
                        {t.title}
                      </p>
                      <p className="text-xs text-fg-3">{t.author}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1.5">
                        <Stars value={r} size="sm" />
                        <span className="numeral text-sm text-accent">{r.toFixed(1)}</span>
                      </span>
                      <span className="text-[0.7rem] text-fg-3">
                        평균 {t.stats.ratingAvg.toFixed(1)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 취향 분석 */}
      {tab === "taste" && (
        <div className="flex flex-col gap-8">
          {profile.ratedCount === 0 && readIds.length === 0 ? (
            <EmptyTeach
              icon={Compass}
              title="취향 데이터를 모으는 중"
              desc="작품을 평가하거나 서재에 담으면, 당신의 취향 스펙트럼을 분석해 드려요."
              cta={{ label: "지금 평가하기", href: "/ranking" }}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-line bg-card p-5">
                  <p className="eyebrow text-fg-3">취향 유형</p>
                  <p className="mt-2 text-2xl font-bold text-accent">
                    {profile.affinityType === "webtoon"
                      ? "웹툰파"
                      : profile.affinityType === "webnovel"
                        ? "웹소설파"
                        : "균형 잡힌 독자"}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-card p-5">
                  <p className="eyebrow text-fg-3">평가 수</p>
                  <p className="numeral mt-2 text-2xl text-fg">{profile.ratedCount}</p>
                </div>
                <div className="rounded-2xl border border-line bg-card p-5">
                  <p className="eyebrow text-fg-3">내 평균 별점</p>
                  <p className="numeral mt-2 text-2xl text-fg">
                    {profile.avgRating ? profile.avgRating.toFixed(1) : "-"}
                  </p>
                </div>
              </div>

              {profile.topGenres.length > 0 && (
                <div className="rounded-2xl border border-line bg-card p-5">
                  <h3 className="mb-4 text-sm font-semibold">선호 장르 스펙트럼</h3>
                  <div
                    className="mb-4 h-1.5 w-full rounded-full"
                    style={{ background: spectrumGradient(profile.topGenres.map((g) => g.name)) }}
                  />
                  <div className="flex flex-col gap-2.5">
                    {profile.topGenres.map((g) => {
                      const max = profile.topGenres[0].weight || 1;
                      return (
                        <MeterBar
                          key={g.name}
                          label={g.name}
                          value={Math.round((g.weight / max) * 100)}
                          suffix=""
                          color={genreColor(g.name, 0.7)}
                        />
                      );
                    })}
                  </div>
                  {profile.topTags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {profile.topTags.map((t) => (
                        <span
                          key={t.name}
                          className="rounded-full border border-line bg-raised/50 px-2.5 py-1 text-xs text-fg-2"
                        >
                          #{t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recs.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles size={16} className="text-accent" />
                    <h3 className="font-semibold">취향 저격 추천</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                    {recs.map(({ title, reason }) => (
                      <div key={title.id} className="flex flex-col gap-1.5">
                        <TitleCard title={title} size="sm" />
                        <p className="text-[0.7rem] leading-snug text-accent">{reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 컬렉션 */}
      {tab === "collections" && (
        <CollectionsTab
          collections={collections}
          onCreate={createCollection}
          onDelete={deleteCollection}
        />
      )}

      {(readIds.length > 0 || ratedIds.length > 0) && (
        <button
          onClick={() => confirm("내 서재 데이터를 모두 초기화할까요?") && resetAll()}
          className="mt-4 self-start text-xs text-fg-3 hover:text-bad"
        >
          서재 데이터 초기화
        </button>
      )}
    </div>
  );
}

function CollectionsTab({
  collections,
  onCreate,
  onDelete,
}: {
  collections: ReturnType<typeof useApp.getState>["collections"];
  onCreate: (name: string, emoji: string) => string;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const EMOJIS = ["📚", "🍿", "🔥", "💔", "🌙", "⚔️", "🌸", "🏆"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3">
        <div className="flex gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={cn(
                "grid size-9 place-items-center rounded-lg text-lg transition-colors",
                emoji === e ? "bg-accent-soft ring-1 ring-accent/40" : "hover:bg-raised"
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 컬렉션 이름"
          className="h-10 min-w-40 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-accent/50"
        />
        <button
          onClick={() => {
            if (name.trim()) {
              onCreate(name.trim(), emoji);
              setName("");
            }
          }}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50"
          disabled={!name.trim()}
        >
          <Plus size={16} /> 만들기
        </button>
      </div>

      {collections.length === 0 ? (
        <EmptyTeach
          icon={FolderHeart}
          title="컬렉션이 없어요"
          desc="나만의 테마로 작품을 묶어보세요. 작품 상세에서 컬렉션에 담을 수 있어요."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {collections.map((c) => {
            const titles = c.titleIds.map((id) => getTitle(id)).filter(Boolean).slice(0, 5);
            return (
              <div key={c.id} className="rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-10 place-items-center rounded-xl text-xl"
                      style={{ background: spectrumGradient(["로맨스", "판타지", "액션"]) }}
                    >
                      {c.emoji}
                    </span>
                    <div>
                      <p className="font-semibold text-fg">{c.name}</p>
                      <p className="text-xs text-fg-3">{c.titleIds.length}편</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="text-fg-3 transition-colors hover:text-bad"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {titles.length > 0 ? (
                  <div className="mt-4 flex gap-2">
                    {titles.map((t) => (
                      <Link key={t!.id} href={`/title/${t!.slug}`} className="w-12">
                        <MiniPoster title={t!} className="w-full" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-fg-3">
                    아직 비어 있어요. 작품 상세에서 {`'`}컬렉션에 담기{`'`}를 눌러보세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
