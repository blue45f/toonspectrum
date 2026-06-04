import { Container } from "@/components/section";
import { ErrorState } from "@/src/components/error-state";
import { Newspaper, ExternalLink } from "lucide-react";
import { useApiResource } from "./use-api-resource";

interface NewsItem {
  title: string;
  source: string;
  url: string;
  date: string;
}
interface NewsResponse {
  items: NewsItem[];
  generatedAt: string;
}

function fmtDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 웹툰·웹소설 뉴스 — 공개 뉴스 피드(Google News)에서 받은 헤드라인을 발행처로 링크아웃.
// 저작권 안전: 헤드라인·출처·날짜만 표기하고 본문은 담지 않으며, 클릭 시 원 발행처로 이동.
export function NewsPage() {
  const { data, loading, error, reload } = useApiResource<NewsResponse>(
    "/data/news.json",
    "뉴스를 불러오지 못했습니다."
  );
  const items = data?.items ?? [];

  return (
    <Container size="prose" className="py-10 sm:py-14">
      <header className="mb-7">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <Newspaper size={14} /> NEWS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">웹툰·웹소설 소식</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          업계 신작·영상화·플랫폼 소식을 한곳에 모았습니다. 제목을 누르면 원 기사로 이동합니다.
        </p>
      </header>

      {loading ? (
        <ul className="flex flex-col gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </ul>
      ) : error ? (
        <ErrorState title="뉴스를 불러오지 못했습니다." message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card/30 p-6 text-center text-sm text-fg-3">
          지금은 표시할 소식이 없어요. 잠시 후 다시 확인해 주세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((it, i) => (
            <li key={i}>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-2xl border border-line bg-card/30 p-4 transition-colors hover:border-line-strong hover:bg-card/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Newspaper size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-fg group-hover:text-accent">
                    {it.title}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[0.72rem] text-fg-3">
                    {it.source && <span className="font-medium text-fg-2">{it.source}</span>}
                    {it.date && <span className="tnum">{fmtDate(it.date)}</span>}
                  </span>
                </span>
                <ExternalLink size={14} className="mt-1 shrink-0 text-fg-3 transition-colors group-hover:text-accent" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[0.7rem] leading-relaxed text-fg-3">
        헤드라인·출처·날짜만 표기하며 본문은 각 발행처에 있습니다. 출처: Google News.
      </p>
    </Container>
  );
}
