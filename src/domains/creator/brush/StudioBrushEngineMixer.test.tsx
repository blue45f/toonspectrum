// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsSettingsForBrushId,
  studioDryMediaKernelDabProgramPin,
} from "./studio-brush-dynamics";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import {
  StudioBrushEngineStackPanel,
  StudioBrushSaveAsCustomControls,
  StudioBrushTraitImportControls,
} from "./StudioBrushEngineMixer";

const putSpy = vi.fn(async (_brush: unknown) => undefined);
const notifySpy = vi.fn();

vi.mock("./studio-brush-library-sqlite-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-brush-library-sqlite-repository")>();
  return {
    ...actual,
    openProductBrushLibraryRepository: vi.fn(async () => ({
      authority: "sqlite" as const,
      repository: {
        put: putSpy,
      },
    })),
    notifyStudioBrushLibraryChanged: () => notifySpy(),
  };
});

afterEach(() => {
  cleanup();
  putSpy.mockClear();
  notifySpy.mockClear();
});

describe("StudioBrushEngineMixer", () => {
  it("renders the engine stack of a dry-media brush including its kernel program", () => {
    const base = studioBrushDynamicsSettingsForBrushId("dry-media");
    expect(base).toBeTruthy();
    // 선택 변주 시임이 카탈로그 선택 시점에 민팅하는 커널 핀을 동일하게 부착한다.
    const settings = normalizeStudioBrushDynamicsSettings({
      ...base!,
      dryMediaKernelProgram: studioDryMediaKernelDabProgramPin(),
    });
    render(
      <StudioBrushEngineStackPanel
        brushId="dry-media"
        settings={settings}
        enginePrograms={null}
      />,
    );
    expect(screen.getByText("드라이 미디어")).toBeTruthy();
    expect(screen.getByText("드라이 미디어 전용 커널")).toBeTruthy();
  });

  it("imports a tip section from the selected source brush", () => {
    const current = studioBrushDynamicsSettingsForBrushId("dry-media")!;
    const source = studioBrushDynamicsSettingsForBrushId("airbrush")!;
    const onSettingsChange = vi.fn();
    render(
      <StudioBrushTraitImportControls
        settings={current}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("소스 브러시"), {
      target: { value: "airbrush" },
    });
    fireEvent.click(screen.getByRole("button", { name: /펜촉/u }));
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange.mock.calls[0][0].tip).toEqual(source.tip);
    expect(screen.getByRole("status").textContent).toContain("가져왔어요");
  });

  it("saves the current snapshot as a named custom brush into the product library", async () => {
    const settings = studioBrushDynamicsSettingsForBrushId("crayon");
    render(
      <StudioBrushSaveAsCustomControls
        snapshot={{
          ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
          brushId: "crayon",
          ...(settings ? { brushDynamics: settings } : {}),
        }}
        baseBrushName="크레용"
      />,
    );
    const nameInput = screen.getByLabelText("새 브러시 이름") as HTMLInputElement;
    expect(nameInput.value).toBe("크레용 조합");
    fireEvent.change(nameInput, { target: { value: "내 크레용" } });
    fireEvent.click(screen.getByRole("button", { name: "내 브러시에 저장" }));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledTimes(1);
    });
    const saved = putSpy.mock.calls[0]?.[0] as
      | { name?: string; brushId?: string }
      | undefined;
    expect(saved?.name).toBe("내 크레용");
    expect(saved?.brushId).toBe("crayon");
    expect(notifySpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("저장했어요");
    });
  });
});
