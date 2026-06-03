"use client";

import type { Title } from "@/lib/types";
import {
  ostsForTitle,
  ostWatchUrl,
  ostMelonUrl,
  ostSpotifyUrl,
  OST_KIND_LABEL,
} from "@/lib/ost-tracks";
import { Section } from "./section";
import { Music, ExternalLink } from "lucide-react";

// 작품 OST·주제가 섹션 — 큐레이션 데이터가 있을 때만 렌더.
// 저작권 안전: 음원/영상을 임베드·재생·저장하지 않고, 곡 정보(사실)만 보여준 뒤
// 재생은 전부 공식 플랫폼(유튜브·멜론·스포티파이)으로 '링크아웃'만 한다.
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
  if (all.length === 0) return null;

  return (
    <Section
      className="mt-14"
      eyebrow="SOUNDTRACK"
      title="주제가 · OST"
      desc="작품의 애니·드라마 대표곡입니다. 공식 플랫폼에서 들어보세요."
    >
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {all.map((t, i) => (
          <li
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-card/30 p-3.5 sm:flex-row sm:items-center"
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(150deg,oklch(0.28_0.09_42),oklch(0.2_0.04_70))] text-accent">
                <Music size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold text-fg">{t.song}</span>
                  <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[0.6rem] font-semibold text-fg-3">
                    {OST_KIND_LABEL[t.kind]}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[0.8rem] text-fg-2">{t.artist}</span>
                <span className="mt-0.5 block text-[0.68rem] text-fg-3">
                  {t.context} · <span className="tnum">{t.year}</span>
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 sm:flex-col sm:items-stretch lg:flex-row">
              <PlatformLink href={ostWatchUrl(t)} label="YouTube" />
              <PlatformLink href={ostMelonUrl(t)} label="멜론" />
              <PlatformLink href={ostSpotifyUrl(t)} label="Spotify" />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.7rem] leading-relaxed text-fg-3">
        음원·영상의 저작권은 각 권리자에게 있습니다. WEBDEX는 음원을 저장·재생하지 않으며, 공식
        플랫폼으로 연결만 합니다.
      </p>
    </Section>
  );
}

function PlatformLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[0.72rem] font-medium text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg"
    >
      {label}
      <ExternalLink size={11} className="text-fg-3" />
    </a>
  );
}
