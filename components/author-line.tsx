import { ArrowUpRight } from "lucide-react";

// 작가명 클릭 → 관련 작가 사이트(웹 검색 게이트웨이: 나무위키·SNS·인터뷰 등)로 새 탭 이동.
function authorSearchUrl(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} 작가`)}`;
}

function Names({ raw }: { raw: string }) {
  const names = raw
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {names.map((n, i) => (
        <span key={`${n}-${i}`}>
          {i > 0 && ", "}
          {n === "미상" ? (
            <span>{n}</span>
          ) : (
            <a
              href={authorSearchUrl(n)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline-offset-2 transition-colors hover:text-accent hover:underline"
              title={`${n} 관련 정보 검색`}
            >
              {n}
              <ArrowUpRight size={12} className="text-fg-3" />
            </a>
          )}
        </span>
      ))}
    </>
  );
}

// 상세 페이지 작가 라인 — 글/그림 이름 클릭 시 작가 페이지로
export function AuthorLine({
  author,
  artist,
  year,
}: {
  author: string;
  artist?: string;
  year: number;
}) {
  const showArtist = artist && artist !== author;
  return (
    <p className="mt-2 text-sm text-fg-2">
      글 <Names raw={author} />
      {showArtist && (
        <>
          {" · "}그림 <Names raw={artist} />
        </>
      )}
      <span className="text-fg-3"> · {year}</span>
    </p>
  );
}
