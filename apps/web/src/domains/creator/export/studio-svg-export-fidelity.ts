/** Worker 경계를 넘어도 이름을 유지하는 SVG 외관 보존 오류다. */
export class StudioSvgTextureBudgetError extends Error {
  constructor(readonly byteBudget: number) {
    super("브러시 질감을 그대로 담는 SVG 용량 한계를 넘어 벡터 저장을 중단했어요. 질감과 해상도를 유지하려면 외관 보존 SVG로 저장해 주세요.");
    this.name = "StudioSvgTextureBudgetError";
  }
}
