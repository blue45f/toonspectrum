// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShaperPanel } from "./StudioShaperPanel";

describe("StudioShaperPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("6개 작업 탭과 헤더, 첫 진입 가이드를 보여준다", () => {
    render(<StudioShaperPanel />);

    expect(screen.getByText("웹툰 캐릭터 셰이퍼")).toBeTruthy();
    expect(screen.getByText("TOONSTUDIO")).toBeTruthy();
    for (const name of ["얼굴 레시피", "외형 코디", "체형", "표정", "추천·포즈", "출력"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    // 첫 진입 가이드 (localStorage toonstudio.shaper.guide.v1)
    expect(screen.getByText(/10초 가이드/)).toBeTruthy();
    expect(screen.getByText(/얼굴·체형·표정을 골라/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "가이드 닫기" }));
    expect(screen.queryByText(/10초 가이드/)).toBeNull();
    expect(window.localStorage.getItem("toonstudio.shaper.guide.v1")).toBe("1");
  });

  it("체형 프리셋·외형 코디 선택을 각 콜백으로 전달하고 VRM 전용 얼굴 옵션은 탭에 노출하지 않는다", () => {
    const onSelectionChange = vi.fn();
    const onAppearanceChange = vi.fn();
    render(
      <StudioShaperPanel
        onSelectionChange={onSelectionChange}
        onAppearanceChange={onAppearanceChange}
      />,
    );

    // 체형 프리셋 → selection.body 커밋 + 슬라이더 동기화
    fireEvent.click(screen.getByRole("tab", { name: "체형" }));
    fireEvent.click(screen.getByRole("button", { name: /SD 귀여운 3등신/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ body: "body-chibi" }));

    // 외형 탭 헤어 선택 → onAppearanceChange
    fireEvent.click(screen.getByRole("tab", { name: "외형 코디" }));
    fireEvent.click(screen.getByRole("tab", { name: "헤어" }));
    fireEvent.click(screen.getByRole("button", { name: /시스루 뱅 단발/ }));
    expect(onAppearanceChange).toHaveBeenCalledWith(
      expect.objectContaining({ selection: expect.objectContaining({ hair: "hair-bob" }) }),
    );

    // 동공·입술·귀는 탭에 노출되지 않고 <details> 안내로만 제공
    expect(screen.queryByRole("tab", { name: "눈동자" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "입술" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "귀" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "얼굴 레시피" }));
    expect(screen.getByText(/VRM 전용 얼굴 옵션/)).toBeTruthy();
  });

  it("장르 레시피는 지원 범주만 적용하고 헤어는 기본값을 유지한다", () => {
    const onSelectionChange = vi.fn();
    render(<StudioShaperPanel onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "추천·포즈" }));
    fireEvent.click(screen.getByRole("button", { name: /학원 로맨스 주인공 지원 범주 적용/ }));

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        face: "face-oval",
        eye: "eye-romance",
        nose: "nose-dot",
        body: "body-slim-female",
        bodypose: "pose-hip",
        hair: "hair-short",
      }),
    );
  });

  it("포즈 검수와 캔버스·PSD 출력을 실제 호스트 콜백으로 라우팅한다", () => {
    const onExportPsd = vi.fn();
    const onInsertCanvas = vi.fn();
    const onTriggerPoseScanner = vi.fn();
    render(
      <StudioShaperPanel
        onExportPsd={onExportPsd}
        onInsertCanvas={onInsertCanvas}
        onTriggerPoseScanner={onTriggerPoseScanner}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "추천·포즈" }));
    fireEvent.click(screen.getByRole("button", { name: "사진 위 랜드마크로 포즈 검수" }));
    expect(onTriggerPoseScanner).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "출력" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 장면을 캔버스에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "레이어드 PSD 내보내기" }));
    expect(onInsertCanvas).toHaveBeenCalledTimes(1);
    expect(onExportPsd).toHaveBeenCalledTimes(1);
  });

  it("콜백이 없으면 PSD 버튼을 비활성화하고 정직 문구를 보여준다", () => {
    render(<StudioShaperPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "출력" }));

    expect((screen.getByRole("button", { name: "레이어드 PSD 내보내기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/가짜 픽셀이나 빈 PSD를 만들지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/데생 인형에는 존재하지 않는 UV 기능/)).toBeTruthy();
  });

  it("체형 슬라이더를 움직이면 인형 파라미터를 실시간 전달하고 사용자 지정 배지를 보여준다", () => {
    const onBodyParamsChange = vi.fn();
    render(<StudioShaperPanel onBodyParamsChange={onBodyParamsChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "체형" }));
    const height = screen.getByLabelText(/키/) as HTMLInputElement;
    expect(height.disabled).toBe(false);
    fireEvent.change(height, { target: { value: "175" } });

    expect(onBodyParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: 175, pelvisWidth: 1 }),
    );
    expect(screen.getByText("사용자 지정")).toBeTruthy();

    // 두신 프리셋 칩 → headCount 동기화
    fireEvent.click(screen.getByRole("button", { name: /SD · 3등신/ }));
    expect(onBodyParamsChange).toHaveBeenCalledWith(expect.objectContaining({ headCount: 3 }));
  });

  it("표정 콤보 선택과 강도 조절을 onExpressionChange으로 전달한다", () => {
    const onExpressionChange = vi.fn();
    render(<StudioShaperPanel onExpressionChange={onExpressionChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "표정" }));
    fireEvent.click(screen.getByRole("button", { name: "놀람 표정 선택" }));
    expect(onExpressionChange).toHaveBeenCalledWith({ comboId: "surprised", intensity: 60 });

    const intensity = screen.getByLabelText(/강도/) as HTMLInputElement;
    fireEvent.change(intensity, { target: { value: "80" } });
    expect(onExpressionChange).toHaveBeenCalledWith({ comboId: "surprised", intensity: 80 });

    // 정직 문구: 데생 인형에는 얼굴 리그가 없음
    expect(screen.getByText(/데생 인형에는 얼굴 리그가 없어/)).toBeTruthy();
  });
});
