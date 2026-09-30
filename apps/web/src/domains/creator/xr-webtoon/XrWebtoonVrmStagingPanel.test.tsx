// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonVrmStagingPanel } from "./XrWebtoonVrmStagingPanel";
import type { XrVrmStagingDescriptor } from "./xr-webtoon-vrm-staging";

afterEach(() => {
  cleanup();
});

describe("XrWebtoonVrmStagingPanel", () => {
  it("cutId가 없으면 다음 행동 안내를 보여준다", () => {
    render(<XrWebtoonVrmStagingPanel onStage={vi.fn()} />);
    expect(screen.getByText(/배치할 컷이 없어요/)).toBeTruthy();
  });

  it("포즈 카드를 선택하면 aria-pressed가 바뀐다", () => {
    render(<XrWebtoonVrmStagingPanel cutId="cut-1" onStage={vi.fn()} />);
    const wave = screen.getByRole("button", { name: /손 흔들기/ });
    expect(wave.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(wave);
    expect(wave.getAttribute("aria-pressed")).toBe("true");
  });

  it("표정·포즈를 선택하면 onStage에 descriptor가 전달된다", () => {
    const onStage = vi.fn();
    render(<XrWebtoonVrmStagingPanel cutId="cut-1" onStage={onStage} />);
    fireEvent.click(screen.getByRole("button", { name: /기쁨/ }));
    fireEvent.click(screen.getByRole("button", { name: /손 흔들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "컷에 캐릭터 배치" }));
    expect(onStage).toHaveBeenCalledTimes(1);
    const spec = onStage.mock.calls[0]?.[0] as XrVrmStagingDescriptor;
    expect(spec.kind).toBe("toonstudio.xr-vrm-staging");
    expect(spec.poseId).toBe("wave");
    expect(spec.expressionId).toBe("happy");
  });

  it("고급 설정은 접혀 있고 좌우 반전을 켤 수 있다", () => {
    const onStage = vi.fn();
    render(<XrWebtoonVrmStagingPanel cutId="cut-1" onStage={onStage} />);
    const details = document.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByLabelText("좌우 반전"));
    fireEvent.click(screen.getByRole("button", { name: "컷에 캐릭터 배치" }));
    const spec = onStage.mock.calls[0]?.[0] as XrVrmStagingDescriptor;
    expect(spec.placement.mirrored).toBe(true);
  });

  it("크기 슬라이더가 placement.scale에 반영된다", () => {
    const onStage = vi.fn();
    const { container } = render(<XrWebtoonVrmStagingPanel cutId="cut-1" onStage={onStage} />);
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0] as HTMLInputElement, { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "컷에 캐릭터 배치" }));
    const spec = onStage.mock.calls[0]?.[0] as XrVrmStagingDescriptor;
    expect(spec.placement.scale).toBeCloseTo(1.5, 5);
  });

  it("onStage가 없으면 버튼이 비활성화된다", () => {
    render(<XrWebtoonVrmStagingPanel cutId="cut-1" />);
    expect(
      (screen.getByRole("button", { name: "컷에 캐릭터 배치" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
