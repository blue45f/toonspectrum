"use client";

import type { Title } from "@/lib/types";
import { ostsForTitle, ostSearchUrl, OST_KIND_LABEL } from "@/lib/ost-tracks";
import { Section } from "./section";
import { Music, Play } from "lucide-react";

// 작품 OST·주제가·뮤직비디오 섹션 — 큐레이션 데이터가 있을 때만 렌더.
// 원작·웹툰·애니·드라마 어느 제목으로든 매칭되도록 original/title 둘 다 조회한다.
export function TitleOst({ title, original }: { title: Title; original?: Title }) {
  const tracks = ostsForTitle(title);
  const fromOriginal = original && original.id !== title.id ? ostsForTitle(original) : [];
  // (song,artist) 중복 제거.
  const seen = new Set<string>();
  const all = [...tracks, ...fromOriginal].filter((t) => {
    const k = `${t.song}|${t.artist}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (all.length === 0) return null;

  return (
    <Section
      className="mt-14"
      eyebrow="SOUNDTRACK"
      title="주제가 · OST"
      desc="작품의 애니·드라마 대표곡과 주제가입니다. 곡을 누르면 유튜브에서 들을 수 있어요."
    >
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {all.map((t, i) => (
          <li key={i}>
            <a
              href={ostSearchUrl(t)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-line bg-card/30 p-3.5 transition-colors hover:border-line-strong hover:bg-card/60"
            >
              <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(150deg,oklch(0.28_0.09_42),oklch(0.2_0.04_70))] text-accent">
                <Music size={18} className="transition-opacity group-hover:opacity-0" />
                <Play
                  size={18}
                  className="absolute inset-0 m-auto fill-current opacity-0 transition-opacity group-hover:opacity-100"
                />
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
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
