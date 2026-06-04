import type { Title } from "@/lib/types";
import { Section } from "./section";
import { Newspaper, BookText, Mic, Search, ArrowUpRight } from "lucide-react";

// 작품 관련 외부 정보 — 크롤·호스팅 불가한 상세 줄거리·뉴스·작가 인터뷰를 '있는 곳'으로 링크아웃.
// 저작권 안전: 본문/내용을 가져오지 않고 검색·문서 페이지로 연결만. 모든 작품에 자동 적용(큐레이션 불필요).
const enc = encodeURIComponent;

function links(title: Title) {
  const t = title.title;
  const kind = title.type === "webnovel" ? "웹소설" : "웹툰";
  const author = (title.author || "").split(",")[0]?.trim();
  const out = [
    {
      icon: BookText,
      label: "줄거리·설정 더보기",
      sub: "나무위키",
      href: `https://namu.wiki/Search?q=${enc(t)}`,
    },
    {
      icon: Newspaper,
      label: "관련 뉴스",
      sub: "구글 뉴스",
      href: `https://news.google.com/search?q=${enc(`${t} ${kind}`)}&hl=ko&gl=KR&ceid=KR:ko`,
    },
    {
      icon: Search,
      label: "리뷰·해석 검색",
      sub: "웹 검색",
      href: `https://www.google.com/search?q=${enc(`${t} ${kind} 줄거리 리뷰`)}`,
    },
  ];
  if (author && author !== "미상") {
    out.push({
      icon: Mic,
      label: `작가 인터뷰·소식`,
      sub: author,
      href: `https://www.google.com/search?q=${enc(`${author} 작가 인터뷰`)}`,
    });
  }
  return out;
}

export function TitleExternal({ title }: { title: Title }) {
  const items = links(title);
  return (
    <Section
      className="mt-14"
      eyebrow="MORE"
      title="관련 정보 더 보기"
      desc="상세 줄거리·뉴스·작가 인터뷰는 원 출처에서 확인하세요. 툰스펙트럼는 연결만 합니다."
    >
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.label}>
            <a
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-line bg-card/30 p-3.5 transition-colors hover:border-line-strong hover:bg-card/60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <it.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg group-hover:text-accent">
                  {it.label}
                </span>
                <span className="mt-0.5 block truncate text-[0.72rem] text-fg-3">{it.sub}</span>
              </span>
              <ArrowUpRight size={15} className="shrink-0 text-fg-3 transition-colors group-hover:text-accent" />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
