"use client";

import { useState } from "react";
import type { Title } from "@/lib/types";
import { ostsForTitle, ostEmbedUrl, ostWatchUrl, OST_KIND_LABEL, type OstTrack } from "@/lib/ost-tracks";
import { Section } from "./section";
import { Music, Play, ExternalLink, X } from "lucide-react";

// 작품 OST·주제가·뮤직비디오 섹션 — 큐레이션 데이터가 있을 때만 렌더.
// videoId 있는 곡은 섹션 상단에 인페이지 플레이어로 재생, 없는 곡은 유튜브로 이동.
export function TitleOst({ title, original }: { title: Title; original?: Title }) {
  const tracks = ostsForTitle(title);
  const fromOriginal = original && original.id !== title.id ? ostsForTitle(original) : [];
  const seen = new Set<string>();
  const all = [...tracks, ...fromOriginal].filter((t) => {
    const k = `${t.song}|${t.artist}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const [active, setActive] = useState<OstTrack | null>(null);
  if (all.length === 0) return null;
  const activeEmbed = active ? ostEmbedUrl(active) : null;

  return (
    <Section
      className="mt-14"
      eyebrow="SOUNDTRACK"
      title="주제가 · OST"
      desc="작품의 애니·드라마 대표곡과 주제가입니다. ▶ 곡은 여기서 바로 재생돼요."
    >
      {activeEmbed && active && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-canvas">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">
              {active.song}
              <span className="ml-2 font-normal text-fg-3">{active.artist}</span>
            </span>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.72rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label="플레이어 닫기"
            >
              <X size={12} /> 닫기
            </button>
          </div>
          <div className="aspect-video w-full">
            <iframe
              key={active.videoId}
              src={`${activeEmbed}?autoplay=1&rel=0`}
              title={`${active.song} - ${active.artist}`}
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {all.map((t, i) => {
          const playable = Boolean(t.videoId);
          const isActive = active?.videoId === t.videoId && playable;
          const inner = (
            <>
              <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(150deg,oklch(0.28_0.09_42),oklch(0.2_0.04_70))] text-accent">
                {playable ? (
                  <Play size={18} className="fill-current" />
                ) : (
                  <Music size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold text-fg group-hover:text-accent">{t.song}</span>
                  <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[0.6rem] font-semibold text-fg-3">
                    {OST_KIND_LABEL[t.kind]}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[0.8rem] text-fg-2">{t.artist}</span>
                <span className="mt-0.5 block text-[0.68rem] text-fg-3">
                  {t.context} · <span className="tnum">{t.year}</span>
                </span>
              </span>
            </>
          );
          return (
            <li key={i} className="flex items-stretch gap-1.5">
              {playable ? (
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : t)}
                  aria-pressed={isActive}
                  className={`group flex flex-1 items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    isActive
                      ? "border-accent/60 bg-accent-soft/40"
                      : "border-line bg-card/30 hover:border-line-strong hover:bg-card/60"
                  }`}
                >
                  {inner}
                </button>
              ) : (
                <a
                  href={ostWatchUrl(t)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-1 items-center gap-3 rounded-2xl border border-line bg-card/30 p-3.5 transition-colors hover:border-line-strong hover:bg-card/60"
                >
                  {inner}
                </a>
              )}
              <a
                href={ostWatchUrl(t)}
                target="_blank"
                rel="noopener noreferrer"
                title="유튜브에서 보기"
                aria-label={`${t.song} 유튜브에서 보기`}
                className="grid shrink-0 place-items-center rounded-xl border border-line px-2 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              >
                <ExternalLink size={14} />
              </a>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
