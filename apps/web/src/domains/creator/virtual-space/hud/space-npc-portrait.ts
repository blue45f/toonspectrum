/**
 * NPC 대화 표정 신호.
 * - 초상화 아트는 별도 일러스트가 아니라 그 NPC 본인 스프라이트의 흉상 크롭이라(SpaceNpcPortrait),
 *   표정이 바뀌어도 아트는 그대로다. 얼굴이 실제 캐릭터와 어긋날 수 없다.
 * - 표정은 이 모듈의 규칙으로 정하고, CSS 몸짓(bounce/pop/tilt)과 data-expression 속성으로만 전한다.
 */
export const SPACE_NPC_EXPRESSIONS = ["happy", "surprised", "thinking"] as const;
export type SpaceNpcVariantExpression = typeof SPACE_NPC_EXPRESSIONS[number];
export type SpaceNpcExpression = "default" | SpaceNpcVariantExpression;

/**
 * 대화 흐름 → 표정 규칙(코디네이터 22:55).
 * 인사·완료 = happy, 새 소식·이벤트 = surprised, 팁·질문·선택지 대기 = thinking, 그 외 = 기본.
 */
export type SpaceNpcDialogueMoment = "greeting" | "done" | "news" | "event" | "tip" | "question" | "choices" | "info";

export function spaceNpcExpressionFor(moment: SpaceNpcDialogueMoment): SpaceNpcExpression {
  switch (moment) {
    case "greeting":
    case "done": return "happy";
    case "news":
    case "event": return "surprised";
    case "tip":
    case "question":
    case "choices": return "thinking";
    case "info": return "default";
  }
}
