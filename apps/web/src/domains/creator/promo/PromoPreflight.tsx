import type { PromoPreflightIssue } from "./promo-preflight";

/** 출력 전 점검 목록 — 점검 결과는 화면(단계 안내)과 공유하도록 호출자가 한 번 계산해 넘긴다. */
export function PromoPreflight({ issues, disabled, onSeek }: {
  issues: readonly PromoPreflightIssue[]; disabled: boolean; onSeek: (frame: number) => void;
}) {
  return <section className="promo-card promo-preflight" aria-labelledby="promo-preflight-title">
    <h2 id="promo-preflight-title">출력 전 점검 · {issues.length}개 확인</h2>
    <p className="promo-muted">원본과 편집값을 살펴보는 보조 점검입니다. 경고는 저장을 막지 않으며 영상 품질·저작권을 보증하지 않습니다.</p>
    {issues.length ? <ul>{issues.map((issue) => {
      const frame = issue.frame;
      return <li key={issue.id} data-severity={issue.severity}>
        <span>{issue.message}</span>
        {frame !== undefined ? <button type="button" disabled={disabled} onClick={() => onSeek(frame)}>해당 장면 확인</button> : null}
      </li>;
    })}</ul> : <p>자동 점검에서 주의사항이 발견되지 않았어요. 마지막으로 미리보기와 소리를 확인하세요.</p>}
  </section>;
}
