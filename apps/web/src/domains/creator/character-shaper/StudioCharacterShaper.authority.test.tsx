// @vitest-environment jsdom
import { useMemo, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Group } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAvatarForgeState } from "../vrm/studio-vrm-avatar-forge";
import { StudioCharacterShaper } from "./StudioCharacterShaper";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { CharacterPlatformWorkbenchState } from "../character-platform/ui/use-character-platform-workbench";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const observed = vi.hoisted(() => ({ binding: null as CharacterShaperBinding | null, workbench: null as CharacterPlatformWorkbenchState | null,
  rows: new Map<string, string>(), documentLoads: 0 }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: (namespace: string) => ({
  get: async (key: string) => { if (key === "character-shaper:mounted-authority") observed.documentLoads++; return observed.rows.get(`${namespace}/${key}`) ?? null; },
  set: async (key: string, value: string) => { observed.rows.set(`${namespace}/${key}`, value); },
  delete: async (key: string) => { observed.rows.delete(`${namespace}/${key}`); },
}) }) }));
vi.mock("../vrm/useStudioVrmPoserController", () => ({ useStudioVrmPoserController: () => {
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [avatarForgeState, handleAvatarForgeChange] = useState(createAvatarForgeState);
  const dialogRef = useRef<HTMLDivElement>(null);
  const vrm = useMemo(() => ({ scene: new Group() }), []);
  return { activeModelId: "mounted-authority", status: "ready", vrm, customColors, setCustomColors, avatarForgeState, handleAvatarForgeChange, dialogRef };
} }));
vi.mock("./StudioCharacterShaperDialog", () => ({ StudioCharacterShaperDialog: ({ binding, onOpenAdvanced }: { binding: CharacterShaperBinding; onOpenAdvanced: () => void }) => {
  observed.binding = binding;
  return <button type="button" onClick={onOpenAdvanced}>고급 편집 열기</button>;
} }));
vi.mock("../vrm/StudioVrmPoserDialog", () => ({ StudioVrmPoserDialog: ({ h }: { h: StudioVrmPoserHost }) => <div ref={h.dialogRef}>고급 편집기</div> }));
vi.mock("../character-platform/thumbnail/character-runtime-thumbnail-store", () => ({ CharacterRuntimeThumbnailRecorder: () => null }));
vi.mock("../character-platform/ui/CharacterPlatformWorkbench", () => ({ CharacterPlatformWorkbench: ({ controller, binding }: { controller: CharacterPlatformWorkbenchState; binding: CharacterShaperBinding }) => {
  observed.workbench = controller;
  expect(binding).toBe(controller.binding);
  return <span>공유 편집 도구</span>;
} }));

afterEach(() => { cleanup(); observed.binding = null; observed.workbench = null; observed.rows.clear(); observed.documentLoads = 0; });

describe("실제 StudioCharacterShaper의 authority 소유", () => {
  it("Dialog와 Workbench가 같은 binding을 받고 고급 편집·닫기 전환에도 하나의 이력을 유지한다", async () => {
    const props = { open: true, onClose: () => undefined, onInsert: () => undefined };
    const view = render(<StudioCharacterShaper {...props} />);
    await waitFor(() => expect(observed.workbench?.authoring.hydrated).toBe(true));
    const authority = observed.workbench?.authoring.authority;
    act(() => observed.binding?.commitColor("skin", "#123456"));
    await waitFor(() => expect(observed.binding?.history.length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "고급 편집 열기" }));
    fireEvent.click(await screen.findByRole("button", { name: "셰이퍼로 돌아가기" }));
    expect(observed.workbench?.authoring.authority).toBe(authority);
    expect(observed.binding?.history.length).toBe(1);
    view.rerender(<StudioCharacterShaper {...props} open={false} />);
    view.rerender(<StudioCharacterShaper {...props} />);
    expect(observed.workbench?.authoring.authority).toBe(authority);
    act(() => observed.binding?.undo());
    await waitFor(() => expect(observed.binding?.history.length).toBe(0));
    expect(observed.workbench?.authoring.snapshot.document.look.colors.skin).toBeNull();
  });
});
