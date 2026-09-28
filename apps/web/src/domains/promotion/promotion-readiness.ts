import { validatePromotion } from "../../../../../packages/core/src/promotion";
import { initialPromotionDraft, type PromotionDraft } from "./promotion-draft";

/** 게시 API와 같은 검증기를 그룹별로 적용해 UI와 서버 규칙의 불일치를 막는다. */
export function promotionReadiness(draft: PromotionDraft, rawTags: string) {
  const tags = rawTags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const baseline = { ...initialPromotionDraft(), rightsConfirmed: true,
    title: "작품 소개", seriesTitle: "작품", description: "독자가 작품의 이야기를 이해할 수 있도록 작성한 소개입니다." };
  const groups = [
    ["copy", { title: draft.title, seriesTitle: draft.seriesTitle, description: draft.description, stage: draft.stage, genre: draft.genre }],
    ["links", { kind: draft.kind, readingUrl: draft.readingUrl, videoUrl: draft.videoUrl }],
    ["media", { cover: draft.cover, tags, contentWarning: draft.contentWarning }],
    ["rights", { rightsConfirmed: draft.rightsConfirmed }],
  ] as const;
  const checks = groups.map(([id, fields]) => {
    const result = validatePromotion({ ...baseline, ...fields });
    return { id, ready: !result.error, error: result.error ?? null };
  });
  const result = validatePromotion({ ...draft, tags });
  return { checks, completed: checks.filter((check) => check.ready).length, ready: !result.error, error: result.error ?? null };
}
