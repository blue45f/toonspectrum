// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareBlenderCharacterPackage } from "../vrm/studio-vrm-blender-package-import";

import { CharacterShaperBlenderPackage } from "./CharacterShaperBlenderPackage";

import type { BlenderPackagePreview } from "../vrm/studio-vrm-blender-package-import";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

vi.mock("../vrm/studio-vrm-blender-package-import", () => ({ prepareBlenderCharacterPackage: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const preview = { manifest: { displayName: "수정본", quality: { score: 96, minimumScore: 86 } },
  asset: { role: "glb" }, runtimeFile: new File(["test"], "edited.glb"), meshes: 2, skins: 0, morphTargets: 1, animations: 0, hasVrm: false,
} as BlenderPackagePreview;
function choose(): void { fireEvent.change(screen.getByLabelText("Blender 캐릭터 패키지 파일 선택"), { target: { files: [new File([], "package.zip")] } }); }
function host() { return { handleGeneratedVrmFile: vi.fn().mockResolvedValue(undefined) } as unknown as StudioVrmPoserHost; }
describe("Blender package explicit handoff", () => {
  it("previews quality and compatibility without replacing the current model", async () => {
    vi.mocked(prepareBlenderCharacterPackage).mockResolvedValue(preview); const h = host();
    render(<CharacterShaperBlenderPackage h={h} />); choose();
    await screen.findByText("수정본"); expect(h.handleGeneratedVrmFile).not.toHaveBeenCalled();
    expect(screen.getByText(/VRM 확장이 없는 GLB/)).toBeTruthy(); expect(screen.getByText("SHA-256 일치")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검증한 모델을 스튜디오로 가져오기" }));
    await waitFor(() => expect(h.handleGeneratedVrmFile).toHaveBeenCalledExactlyOnceWith(preview.runtimeFile));
    expect(screen.getByRole("status").textContent).not.toContain("불러왔습니다");
  });
  it("cancels preflight and ignores a late promise result", async () => {
    let resolve!: (value: BlenderPackagePreview) => void;
    vi.mocked(prepareBlenderCharacterPackage).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const h = host(); render(<CharacterShaperBlenderPackage h={h} />); choose();
    fireEvent.click(screen.getByRole("button", { name: "검증 취소" })); resolve(preview);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("아직 불러온"));
    expect(screen.queryByLabelText("검증된 Blender 패키지 정보")).toBeNull(); expect(h.handleGeneratedVrmFile).not.toHaveBeenCalled();
  });
  it("blocks installation if the editor becomes locked after preflight", async () => {
    vi.mocked(prepareBlenderCharacterPackage).mockResolvedValue(preview); const h = host();
    const ui = render(<CharacterShaperBlenderPackage h={h} />); choose(); await screen.findByText("수정본");
    ui.rerender(<CharacterShaperBlenderPackage h={h} disabled />);
    const button = screen.getByRole("button", { name: "검증한 모델을 스튜디오로 가져오기" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button); expect(h.handleGeneratedVrmFile).not.toHaveBeenCalled();
  });
  it("aborts unfinished verification on unmount", () => {
    vi.mocked(prepareBlenderCharacterPackage).mockReturnValue(new Promise(() => {}));
    const ui = render(<CharacterShaperBlenderPackage h={host()} />); choose();
    const options = vi.mocked(prepareBlenderCharacterPackage).mock.calls[0]![1]!;
    ui.unmount(); expect(options.signal?.aborted).toBe(true);
  });
  it("surfaces a host rejection without reporting success", async () => {
    vi.mocked(prepareBlenderCharacterPackage).mockResolvedValue(preview); const h = host();
    vi.mocked(h.handleGeneratedVrmFile).mockRejectedValue(new Error("설치 오류"));
    render(<CharacterShaperBlenderPackage h={h} />); choose(); await screen.findByText("수정본");
    fireEvent.click(screen.getByRole("button", { name: "검증한 모델을 스튜디오로 가져오기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("설치 오류"));
  });
});
