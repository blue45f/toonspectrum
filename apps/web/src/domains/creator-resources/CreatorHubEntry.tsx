import { Link } from "react-router-dom";

const ENTRY_LINKS = [
  ["/research", "리서치 데스크 열기"],
  ["/research/books", "글로벌 판본 탐색"],
  ["/research/assets", "창작 자료"],
  ["/opportunities", "작가 기회센터"],
] as const;

export function CreatorHubEntry() {
  return <section aria-label="창작 리서치 바로가기" className="mx-auto my-10 max-w-6xl rounded-2xl border border-line bg-panel p-6 text-fg">
    <p className="text-sm font-semibold text-accent">SPECTRUM RESEARCH DESK</p>
    <h2 className="mt-2 font-display text-2xl font-bold">아이디어를 찾고, 근거를 모아, 다음 장면으로</h2>
    <p className="mt-2 leading-7 text-fg-2">글로벌 작품·판본, 출처가 있는 레퍼런스, 지원사업을 하나의 창작 보드에 정리하세요.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      {ENTRY_LINKS.map(([path, title]) =>
        <Link key={path} to={path} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{title} →</Link>)}
    </div>
  </section>;
}
