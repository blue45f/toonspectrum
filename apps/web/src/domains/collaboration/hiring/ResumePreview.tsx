import { CREATOR_HIRING_ROLES } from "../../../../../../packages/contracts/src/creator-hiring";

import type { HiringResumeContent } from "../../../../../../packages/contracts/src/creator-hiring";

export function ResumePreview({ content }: { content: HiringResumeContent }) {
  return <article className="hiring-print-area space-y-4 rounded-xl border border-line bg-panel p-5" aria-label="이력서 미리보기">
    <h3 className="text-xl font-bold">{content.penName || "활동명"}</h3>
    <p>{content.roles.map((r) => CREATOR_HIRING_ROLES[r]).join(" · ")}</p>
    <p className="whitespace-pre-wrap break-words">{content.summary}</p>
    <dl className="space-y-2 text-sm"><dt className="font-semibold">작업 도구</dt><dd>{content.tools.join(" · ") || "미입력"}</dd><dt className="font-semibold">납품 형식</dt><dd>{content.formats.join(" · ") || "미입력"}</dd><dt className="font-semibold">사용 언어</dt><dd>{content.languages.join(" · ") || "미입력"}</dd></dl>
    <h4 className="font-bold">작업 경험 · 본인 작성</h4>
    {content.experiences.length === 0 && <p className="text-sm">등록한 작업 경험이 없어요.</p>}
    {content.experiences.map((e, i) => <section key={i} className="border-t border-line pt-3"><h5 className="font-semibold">{e.title} · {CREATOR_HIRING_ROLES[e.role]}</h5><p className="text-sm">{e.startMonth} ~ {e.endMonth ?? "진행 중"}{e.episodeFrom !== null ? ` · ${e.episodeFrom}~${e.episodeTo}화` : ""}</p><p className="whitespace-pre-wrap break-words text-sm">{e.contribution}</p></section>)}
    <h4 className="font-bold">포트폴리오</h4>
    {content.portfolio.length === 0 && <p className="text-sm">첨부한 포트폴리오가 없어요.</p>}
    {content.portfolio.map((p, i) => <section key={i} className="border-t border-line pt-3"><a className="break-all text-accent underline" href={/^https:\/\//iu.test(p.url) ? p.url : undefined} target="_blank" rel="noopener noreferrer nofollow">{p.title}</a><p className="whitespace-pre-wrap text-sm">{p.contribution}</p><p className="text-xs text-fg-3">{p.permission === "owned" ? "본인 소유라고 표시한 자료" : "공유 허락을 받았다고 표시한 자료"} · 권리·경력 검증 표시는 아닙니다.</p></section>)}
  </article>;
}
