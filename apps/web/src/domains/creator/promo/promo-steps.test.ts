import { describe, expect, it } from "vitest";

import { emptyPromoProject, type PromoPanel } from "./promo-model";
import { PROMO_STEP_ANCHOR, promoStepStatuses } from "./promo-steps";

const PANEL: PromoPanel = {
  id: "p1",
  src: "data:image/png;base64,AAAA",
  description: "",
  caption: "",
  motion: "push-in",
  fit: "contain",
  weight: 1,
};

function states(...args: Parameters<typeof promoStepStatuses>) {
  return Object.fromEntries(promoStepStatuses(...args).map((step) => [step.id, step.state]));
}

describe("promoStepStatuses", () => {
  it("빈 프로젝트는 컷 추가를 지금 할 일로, 줄거리·음악은 선택으로 안내한다", () => {
    expect(states(emptyPromoProject(), [{ severity: "error" }])).toEqual({
      plan: "optional",
      cuts: "current",
      sound: "optional",
      export: "todo",
    });
  });

  it("컷이 있고 오류가 없으면 내보내기를 지금 할 일로 연다", () => {
    const project = { ...emptyPromoProject(), synopsis: "밤의 도시에서 다시 만난 두 사람", panels: [PANEL] };
    expect(states(project, [{ severity: "warning" }])).toEqual({
      plan: "done",
      cuts: "done",
      sound: "optional",
      export: "current",
    });
  });

  it("오류가 남아 있으면 내보내기는 대기하고, 소리를 넣으면 완료로 바뀐다", () => {
    const project = {
      ...emptyPromoProject(),
      panels: [PANEL],
      audio: { src: "data:audio/wav;base64,AAAA", volume: 0.25 },
    };
    expect(states(project, [{ severity: "error" }])).toMatchObject({ sound: "done", export: "todo" });
  });

  it("단계마다 이동할 카드 앵커가 있다", () => {
    expect(Object.values(PROMO_STEP_ANCHOR)).toEqual(["promo-step-plan", "promo-step-cuts", "promo-step-sound", "promo-step-export"]);
  });
});
