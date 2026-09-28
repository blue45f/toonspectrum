// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromotionCoverDropzone } from "./PromotionCoverDropzone";
import { promotionReadiness } from "./promotion-readiness";
import { initialPromotionDraft } from "./promotion-draft";
import { validatePromotion } from "../../../../../packages/core/src/promotion";

afterEach(cleanup);
describe("홍보 게시 전 점검", () => {
  const valid = { ...initialPromotionDraft(), title: "새 작품 소개", seriesTitle: "별의 여행", description: "별을 찾아 떠나는 주인공의 새로운 모험을 소개하는 웹툰입니다.", rightsConfirmed: true };
  it("선택 사항인 표지와 읽기 링크가 없어도 필수 검사와 일치한다", () => {
    const state = promotionReadiness(valid, "성장,첫연재");
    expect(state.ready).toBe(true);
    expect(state.completed).toBe(4);
    expect(validatePromotion({ ...valid, tags: ["성장", "첫연재"] }).error).toBeUndefined();
  });
  it("권한 동의·영상 링크·태그 제한을 실제 게시 검증과 동일하게 처리한다", () => {
    for (const draft of [initialPromotionDraft(), { ...valid, rightsConfirmed: false },
      { ...valid, kind: "trailer" as const }, { ...valid, readingUrl: "javascript:alert(1)" }]) {
      const state = promotionReadiness(draft, "");
      expect(state.ready).toBe(!validatePromotion({ ...draft, tags: [] }).error);
      expect(state.ready).toBe(false);
    }
    expect(promotionReadiness(valid, Array.from({ length: 9 }, (_, i) => `태그${i}`).join(",")).ready).toBe(false);
  });
});
describe("홍보 표지 드롭", () => {
  it("단일 이미지만 전달하고 다중 파일·SVG·외부 텍스트는 무시한다", () => {
    const onSelect = vi.fn();
    render(<PromotionCoverDropzone cover="" busy={false} disabled={false} onSelect={onSelect} onRemove={vi.fn()} />);
    const zone = screen.getByRole("region", { name: "홍보 표지 업로드" });
    const image = new File(["image"], "cover.png", { type: "image/png" });
    fireEvent.drop(zone, { dataTransfer: { files: [image], types: ["Files"] } });
    expect(onSelect).toHaveBeenCalledWith(image);
    onSelect.mockClear();
    fireEvent.drop(zone, { dataTransfer: { files: [image, image], types: ["Files"] } });
    expect(screen.getByRole("alert").textContent).toContain("한 개");
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["<svg/>"], "cover.svg", { type: "image/svg+xml" })], types: ["Files"] } });
    expect(screen.getByRole("alert").textContent).toContain("JPEG");
    fireEvent.drop(zone, { dataTransfer: { files: [], types: ["text/plain"] } });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("이미지 변환 중에는 새 드롭과 파일 선택을 잠근다", () => {
    const onSelect = vi.fn();
    render(<PromotionCoverDropzone cover="" busy disabled={false} onSelect={onSelect} onRemove={vi.fn()} />);
    fireEvent.drop(screen.getByRole("region", { name: "홍보 표지 업로드" }), { dataTransfer: { files: [new File(["image"], "cover.jpg", { type: "image/jpeg" })], types: ["Files"] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect((screen.getByLabelText("표지 이미지 선택") as HTMLInputElement).disabled).toBe(true);
  });
});
