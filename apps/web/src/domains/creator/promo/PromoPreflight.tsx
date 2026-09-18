import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { promoPreflight } from "./promo-preflight";

import type { PromoProject } from "./promo-model";

export function PromoPreflight({ project, disabled, onSeek }: {
  project: PromoProject; disabled: boolean; onSeek: (frame: number) => void;
}) {
  const issues = promoPreflight(project);
  return <section className="promo-card promo-preflight" aria-labelledby="promo-preflight-title">
    <h2 id="promo-preflight-title">{translateCurrentStaticSourceText("domains.creator.promo.PromoPreflight", "ko", "출력 전 점검 · ")}{issues.length}{translateCurrentStaticSourceText("domains.creator.promo.PromoPreflight", "ko", "개 확인")}</h2>
    <p className="promo-muted">{translateCurrentStaticSourceText("domains.creator.promo.PromoPreflight", "ko", "원본과 편집값을 살펴보는 보조 점검입니다. 경고는 저장을 막지 않으며 영상 품질·저작권을 보증하지 않습니다.")}</p>
    {issues.length ? <ul>{issues.map((issue) => <li key={issue.id} data-severity={issue.severity}>
      <span>{issue.message}</span>
      {issue.frame !== undefined ? <button type="button" disabled={disabled} onClick={() => onSeek(issue.frame!)}>{translateCurrentStaticSourceText("domains.creator.promo.PromoPreflight", "ko", "해당 장면 확인")}</button> : null}
    </li>)}</ul> : <p>{translateCurrentStaticSourceText("domains.creator.promo.PromoPreflight", "ko", "자동 점검에서 주의사항이 발견되지 않았어요. 마지막으로 미리보기와 소리를 확인하세요.")}</p>}
  </section>;
}
