// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpriteSheetCustomizer } from "./StudioVirtualSpriteSheetCustomizer";
import { spriteSheetConfigSchema } from "./studio-virtual-space-sprite-sheet";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";

afterEach(() => cleanup());

const BASE_PROFILE: StudioVirtualAvatarProfile = {
  skin: "oklch(0.91 0.055 55)",
  hair: "oklch(0.31 0.055 25)",
  hairHighlight: "oklch(0.56 0.12 25)",
  outfit: "oklch(0.63 0.2 300)",
  accent: "oklch(0.78 0.19 335)",
  accessory: "glasses",
  hairStyle: "bob",
  outfitStyle: "hoodie",
  expression: "smile",
};

const SHEET = spriteSheetConfigSchema.parse({
  image: "preset:pixel-warrior",
  frameWidth: 96,
  frameHeight: 112,
  framesPerDirection: 10,
  directionCount: 8,
});

describe("StudioVirtualSpriteSheetCustomizer", () => {
  it("섹션·업로드 영역·프리셋 3종을 렌더링한다", () => {
    render(<StudioVirtualSpriteSheetCustomizer profile={BASE_PROFILE} onSave={() => true} />);
    expect(screen.getByLabelText("스프라이트 시트")).toBeTruthy();
    expect(screen.getByLabelText("스프라이트 시트 PNG 선택")).toBeTruthy();
    // 내장 프리셋 3종 버튼
    const presetGroup = screen.getByRole("group", { name: "프리셋" });
    expect(presetGroup.querySelectorAll("button")).toHaveLength(3);
    // 모션 14종 + 방향 8종 칩
    expect(screen.getByRole("group", { name: "모션" }).querySelectorAll("button")).toHaveLength(14);
    expect(screen.getByRole("group", { name: "방향" }).querySelectorAll("button")).toHaveLength(8);
    // 시트 미적용 상태 문구
    expect(screen.getByText("현재는 기본 캐릭터를 사용 중입니다.")).toBeTruthy();
  });

  it("시트 적용하기를 누르면 유효한 설정을 onSave로 넘긴다", () => {
    const onSave = vi.fn((_profile: StudioVirtualAvatarProfile) => true);
    render(<StudioVirtualSpriteSheetCustomizer profile={BASE_PROFILE} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "시트 적용하기" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.spriteSheet).toBeDefined();
    // 저장된 시트는 스키마를 통과한다.
    expect(() => spriteSheetConfigSchema.parse(saved?.spriteSheet)).not.toThrow();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("적용된 시트가 있으면 적용 중 문구와 되돌리기 버튼을 보여준다", () => {
    const onSave = vi.fn((_profile: StudioVirtualAvatarProfile) => true);
    render(<StudioVirtualSpriteSheetCustomizer profile={{ ...BASE_PROFILE, spriteSheet: SHEET }} onSave={onSave} />);
    expect(screen.getByText("적용 중: 커스텀 스프라이트 시트")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "되돌리기 (기본 캐릭터)" }));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.spriteSheet).toBeUndefined();
  });

  it("모션 칩을 누르면 미리보기 라벨이 바뀐다", () => {
    render(<StudioVirtualSpriteSheetCustomizer profile={BASE_PROFILE} onSave={() => true} />);
    const dance = screen.getByRole("button", { name: "춤" });
    fireEvent.click(dance);
    expect(dance.getAttribute("aria-pressed")).toBe("true");
  });

  it("방향 칩을 누르면 선택 상태가 바뀐다", () => {
    render(<StudioVirtualSpriteSheetCustomizer profile={BASE_PROFILE} onSave={() => true} />);
    const left = screen.getByRole("button", { name: "왼쪽" });
    fireEvent.click(left);
    expect(left.getAttribute("aria-pressed")).toBe("true");
  });

  it("잘못된 PNG가 아닌 파일을 올리면 오류를 보여준다", async () => {
    render(<StudioVirtualSpriteSheetCustomizer profile={BASE_PROFILE} onSave={() => true} />);
    const input = screen.getByLabelText("스프라이트 시트 PNG 선택") as HTMLInputElement;
    const file = new File(["not-a-png"], "avatar.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("PNG");
  });
});
