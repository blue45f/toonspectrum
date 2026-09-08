// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_VRM_PROP_VISUAL_QUARANTINE,
  isStudioVrmPropSelectable,
  studioVrmPropQualityNotice,
} from "./studio-vrm-prop-quality-policy";
import { DEFAULT_VRM_PROP_RIG_METRICS } from "./studio-vrm-prop-rig";
import {
  VRM_PROPS,
  createPropInstance,
  parseVrmProps,
  propDefById,
  serializeVrmProps,
  type PropInstance,
} from "./studio-vrm-props";
import { StudioVrmPropPanel } from "./StudioVrmPropPanel";

afterEach(cleanup);

function renderPanel(items: PropInstance[] = [], vrmReady = true, hairRisk = false) {
  const onAdd = vi.fn();
  const onUpdate = vi.fn<(uid: string, patch: Partial<PropInstance>) => void>();
  const onRemove = vi.fn();
  const rendered = render(
    <StudioVrmPropPanel
      vrmReady={vrmReady}
      rigMetrics={hairRisk ? { ...DEFAULT_VRM_PROP_RIG_METRICS, faceSocket: { ...DEFAULT_VRM_PROP_RIG_METRICS.faceSocket, hairClearanceRequired: true } } : DEFAULT_VRM_PROP_RIG_METRICS}
      items={items}
      selectedUid={items[0]?.uid ?? null}
      onSelect={vi.fn()}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onClear={vi.fn()}
    />,
  );
  return { ...rendered, onAdd, onUpdate, onRemove };
}

function addButtonLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button[aria-label]")]
    .map((button) => button.getAttribute("aria-label") ?? "")
    .filter((label) => label.includes(" 추가."));
}

describe("wearable visual-quality selection policy", () => {
  it("keeps every quarantined ID resolvable and documents its visual defect", () => {
    const entries = Object.entries(STUDIO_VRM_PROP_VISUAL_QUARANTINE);
    expect(entries).toHaveLength(35);
    for (const [id, reason] of entries) {
      expect(propDefById(id)).toBeDefined();
      expect(isStudioVrmPropSelectable(id)).toBe(false);
      expect(studioVrmPropQualityNotice(id)).toBe(reason);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it("excludes quarantined props from both recommendations and the complete catalogue", () => {
    const { container } = renderPanel();
    const labels = addButtonLabels(container);
    for (const id of Object.keys(STUDIO_VRM_PROP_VISUAL_QUARANTINE)) {
      expect(labels).not.toContain(`${propDefById(id)!.label} 추가. ${propDefById(id)!.hint}`);
    }
    for (const def of VRM_PROPS.filter((item) => isStudioVrmPropSelectable(item.id))) {
      expect(labels).toContain(`${def.label} 추가. ${def.hint}`);
    }
    expect(container.querySelector("summary")?.textContent).toContain(
      `${VRM_PROPS.filter((item) => isStudioVrmPropSelectable(item.id)).length}종`,
    );
  });

  it("does not reintroduce a quarantined prop through text search", () => {
    const { container } = renderPanel();
    const details = container.querySelector("details");
    if (details) details.open = true;
    fireEvent.change(screen.getByRole("searchbox", { name: "소품 검색" }), {
      target: { value: propDefById("gloves")!.label },
    });
    expect(addButtonLabels(container)).not.toContain(
      `${propDefById("gloves")!.label} 추가. ${propDefById("gloves")!.hint}`,
    );
  });

  it("adds the upgraded microphone from recommendations with the same stable ID", () => {
    const { onAdd } = renderPanel();
    const def = propDefById("mic")!;
    fireEvent.click(screen.getAllByRole("button", { name: `${def.label} 추가. ${def.hint}` })[0]!);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("mic");
  });

  it("does not allow new attachments before the VRM is ready", () => {
    const { onAdd } = renderPanel([], false);
    const def = propDefById("mic")!;
    const button = screen.getAllByRole("button", { name: `${def.label} 추가. ${def.hint}` })[0]!;
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("warns about native hair clearance without modifying an existing head attachment", () => {
    const item = createPropInstance("cap", "hair-clearance-cap")!;
    const { onUpdate, onRemove } = renderPanel([item], true, true);
    expect(screen.getByRole("note", { name: "헤어 간섭 안내" }).textContent).toContain("측면");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it.each(["hanging_sign", "traffic_light", "mailbox", "bubble_tea", "ice_cream_cone", "fox_mask", "robot_pet"])(
    "keeps a saved %s editable and re-saveable while adding only its explicit new revision",
    (name) => {
      const oldId = `blender_${name}`;
      const definition = propDefById(oldId)!;
      const saved = { version: 1, items: [{ uid: `saved-${name}`, propId: oldId, bone: definition.defaultBone, position: [0.12, -0.04, 0.08], rotationDeg: [10, 20, 30], scale: 0.9, color: null }] };
      const restored = parseVrmProps(saved).items;
      const { container, onAdd, onUpdate, onRemove } = renderPanel(restored);
      expect(screen.getByRole("heading", { name: `${definition.label} 편집` })).not.toBeNull();
      const position = screen.getByRole("slider", { name: "위치 X축" });
      expect(position.getAttribute("value")).toBe("0.12");
      fireEvent.change(position, { target: { value: "0.17" } });
      expect(onUpdate).toHaveBeenCalledExactlyOnceWith(`saved-${name}`, { position: [0.17, -0.04, 0.08] });
      const edited = { ...restored[0]!, ...onUpdate.mock.calls[0]![1] };
      expect(parseVrmProps(serializeVrmProps([edited])).items).toEqual([{ ...restored[0], position: [0.17, -0.04, 0.08] }]);
      expect(edited.propId).toBe(oldId);
      expect(onRemove).not.toHaveBeenCalled();
      const details = container.querySelector("details");
      if (!details) throw new Error("Expected the actual prop catalogue");
      details.open = true;
      fireEvent.change(screen.getByRole("searchbox", { name: "소품 검색" }), { target: { value: definition.label } });
      const refined = propDefById(`${oldId}_v8`)!;
      expect(screen.queryByRole("button", { name: `${definition.label} 추가. ${definition.hint}` })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: `${refined.label} 추가. ${refined.hint}` }));
      expect(onAdd).toHaveBeenCalledExactlyOnceWith(`${oldId}_v8`);
    },
  );

  it("keeps saved quarantined items and their transforms intact and editable", () => {
    const item = createPropInstance("sword", "saved-sword")!;
    item.position = [0.12, -0.04, 0.08];
    item.rotationDeg = [10, 20, 30];
    item.color = "#346789";
    const document = JSON.parse(JSON.stringify(serializeVrmProps([item]))) as unknown;
    const restored = parseVrmProps(document).items;
    expect(restored).toEqual([item]);
    const { container, onUpdate, onRemove } = renderPanel(restored);
    expect(screen.getByRole("heading", { name: `${propDefById("sword")!.label} 편집` })).not.toBeNull();
    expect(screen.getByRole("note", { name: "소품 품질 안내" }).textContent).toContain("기존 장면");
    expect(addButtonLabels(container)).not.toContain(`${propDefById("sword")!.label} 추가. ${propDefById("sword")!.hint}`);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
