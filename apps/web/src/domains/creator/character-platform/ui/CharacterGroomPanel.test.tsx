// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterAuthoringAuthority } from "../application/character-authoring-authority";
import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { addCharacterGroomGroup } from "../groom/character-groom-edit";
import { buildCharacterGroomRibbon } from "../groom/character-groom-document";
import { CharacterGroomPanel } from "./CharacterGroomPanel";

import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";
import type { CharacterGroomRuntimeState } from "../groom/use-character-groom-runtime";

vi.mock("@/shared/lib/i18n", () => ({ useT: () => (_key: string, fallback: string) => fallback }));
afterEach(cleanup);

function fixture(options: { readonly supported?: boolean; readonly hydrated?: boolean; readonly anchored?: boolean; readonly anchorAttached?: boolean; readonly notices?: readonly string[] } = {}) {
  const document = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:groom-ui",
    model: { assetId: "model:hero", assetVersion: "1", contentSha256: null, mode: "canonical", topologyFamily: "family:test", topologyRevision: "topology:test", rigRevision: "rig:1", morphRevision: "morph:1", rendererRevision: "renderer:1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:1" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  const initial = options.anchored ? addCharacterGroomGroup(document.groom, "불러온 두피 헤어") : document.groom;
  const authority = new CharacterAuthoringAuthority({ ...document, groom: options.anchored ? {
    ...initial, groups: initial.groups.map((group) => ({ ...group, scalpRegionId: "scalp:front", guides: group.guides.map((guide) => ({ ...guide,
      points: guide.points.map((point, index) => index === 0 ? { ...point, surfaceAnchor: {
        meshAssetId: "model/scalp", topologyRevision: "topology:scalp", primitiveIndex: 0, triangleIndex: 0,
        barycentric: [1, 0, 0], localNormal: [0, 0, 1],
      } } : point),
    })) })),
  } : initial });
  const runtime: CharacterGroomRuntimeState = {
    supported: options.supported !== false, reason: null, status: "ready", error: null,
    guideCount: 0, triangleCount: 0, skippedGuideCount: 0, retry: vi.fn(),
    attachedGuideIds: options.anchorAttached ? ["groom:guide:1"] : [], notices: options.notices,
  };
  function Harness() {
    const snapshot = useSyncExternalStore(authority.subscribe, authority.getSnapshot, authority.getSnapshot);
    const hook: CharacterAuthoringAuthorityHookResult = {
      authority, snapshot, hydrated: options.hydrated !== false, persistenceStatus: "ready", persistenceError: null,
      dispatch: (command) => authority.dispatch(command), beginPreview: (command) => authority.beginPreview(command),
      cancelPreview: () => authority.cancelPreview(), commitPreview: () => authority.commitPreview(),
      undo: () => authority.undo(), redo: () => authority.redo(), exportJson: () => "", importJson: async () => false,
      saveNow: async () => true, retryRestore: () => undefined, setRuntimeSyncPending: () => undefined,
    };
    return <CharacterGroomPanel authoring={hook} runtime={runtime} />;
  }
  render(<Harness />);
  return authority;
}

function click(name: string) { fireEvent.click(screen.getByRole("button", { name })); }

function ribbon(authority: CharacterAuthoringAuthority) {
  const snapshot = authority.getSnapshot();
  const group = (snapshot.previewDocument ?? snapshot.document).groom.groups[0];
  const guide = group?.guides[0];
  if (!group || !guide) throw new Error("편집한 헤어 가이드가 없습니다.");
  return buildCharacterGroomRibbon(guide, group.profile);
}

describe("CharacterGroomPanel", () => {
  it("부착된 임포트 가이드의 profile·표시를 V3 preview/apply/undo로 편집하며 앵커 원본을 보존한다", () => {
    const authority = fixture({ anchored: true, anchorAttached: true });
    const anchor = authority.getSnapshot().document.groom.groups[0]?.guides[0]?.points[0]?.surfaceAnchor;
    expect(screen.getByText(/두피 루트 앵커가 원본 표면에 부착되었습니다/).textContent).toContain("자동 재투영은 지원하지 않습니다");
    expect(screen.getByRole("spinbutton", { name: "길이 배율" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("group", { name: "선택 가이드 곡선" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("spinbutton", { name: "길이 배율" }), { target: { value: "1.6" } });
    click("헤어 미리보기"); click("헤어 적용");
    expect(authority.getSnapshot().document.groom.groups[0]?.profile.lengthScale).toBe(1.6);
    expect(authority.getSnapshot().document.groom.groups[0]?.guides[0]?.points[0]?.surfaceAnchor).toEqual(anchor);
    fireEvent.click(screen.getByRole("switch", { name: "그룹 표시" }));
    click("헤어 미리보기"); click("헤어 적용");
    expect(authority.getSnapshot().document.groom.groups[0]?.visible).toBe(false);
    click("저작 실행 취소"); click("저작 실행 취소");
    expect(authority.getSnapshot().document.groom.groups[0]?.visible).toBe(true);
    expect(authority.getSnapshot().document.groom.groups[0]?.profile.lengthScale).toBe(1);
  });

  it("확인되지 않은 두피 토폴로지는 부착 완료로 표시하지 않고 구체적인 복구 제한을 알린다", () => {
    fixture({ anchored: true, notices: ["두피 토폴로지가 원본과 다릅니다. 원래 모델을 복원해 주세요."] });
    expect(screen.queryByText(/두피 루트 앵커가 원본 표면에 부착되었습니다/)).toBeNull();
    expect(screen.getByText(/두피 토폴로지가 원본과 다릅니다/)).toBeTruthy();
    expect(screen.getByText(/다른 topology, 여러 점의 앵커/)).toBeTruthy();
  });

  it("그룹·가이드를 추가하고 실제 미리보기 좌표를 수정한 뒤 취소하면 원본을 유지한다", () => {
    const authority = fixture();
    click("그룹 추가"); click("가이드 추가"); click("헤어 미리보기");
    const first = ribbon(authority);
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(0);
    expect(authority.getSnapshot().previewDocument?.groom.groups[0]?.guides).toHaveLength(2);
    fireEvent.change(screen.getByRole("spinbutton", { name: "길이 배율" }), { target: { value: "1.6" } });
    expect([...ribbon(authority).positions]).not.toEqual([...first.positions]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "말림" }), { target: { value: "0.6" } });
    expect(authority.getSnapshot().previewDocument?.groom.groups[0]?.profile.curl).toBe(0.6);
    click("헤어 취소");
    expect(authority.getSnapshot().previewDocument).toBeNull();
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(0);
    expect(authority.getSnapshot().canUndo).toBe(false);
  });

  it("그룹·가이드 복제·삭제와 제어점 수정을 실제 원본에 적용하고 실행 취소한다", () => {
    const authority = fixture();
    click("그룹 추가"); click("가이드 복제");
    fireEvent.change(screen.getByRole("spinbutton", { name: "X (m)" }), { target: { value: "0.08" } });
    click("헤어 미리보기");
    expect(authority.getSnapshot().previewDocument?.groom.groups[0]?.guides[1]?.points[0]?.position[0]).toBe(0.08);
    click("헤어 적용");
    expect(authority.getSnapshot().document.groom.groups[0]?.guides).toHaveLength(2);
    click("가이드 삭제"); click("그룹 복제"); click("헤어 미리보기"); click("헤어 적용");
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(2);
    click("그룹 삭제"); click("헤어 미리보기"); click("헤어 적용");
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(1);
    click("저작 실행 취소");
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(2);
    click("저작 실행 취소");
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(1);
    expect(authority.getSnapshot().document.groom.groups[0]?.guides[1]?.points[0]?.position[0]).toBe(0.08);
    click("저작 실행 취소");
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(0);
  });

  it.each([{ supported: false }, { hydrated: false }])("모델 지원과 복원 완료를 확인하기 전에는 편집하지 않는다: %j", (options) => {
    const authority = fixture(options);
    const button = screen.getByRole("button", { name: "그룹 추가" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(authority.getSnapshot().previewDocument).toBeNull();
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(0);
  });

  it("편집 패널을 닫으면 미확정 메시 미리보기를 취소한다", () => {
    const authority = fixture();
    click("그룹 추가"); click("헤어 미리보기");
    expect(authority.getSnapshot().previewDocument).not.toBeNull();
    cleanup();
    expect(authority.getSnapshot().previewDocument).toBeNull();
    expect(authority.getSnapshot().document.groom.groups).toHaveLength(0);
  });

  it("유효하지 않은 길이를 오류로 알리고 마지막 유효 가이드와 미리보기를 지킨다", () => {
    const authority = fixture();
    click("그룹 추가"); click("헤어 미리보기");
    fireEvent.change(screen.getByRole("spinbutton", { name: "길이 배율" }), { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toContain("범위");
    expect(authority.getSnapshot().previewDocument?.groom.groups[0]?.profile.lengthScale).toBe(1);
    expect(ribbon(authority).indices.length).toBeGreaterThan(0);
  });
});
