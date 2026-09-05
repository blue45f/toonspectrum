// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_VRM_PROP_VISUAL_QUARANTINE } from "./studio-vrm-prop-quality-policy";
import { DEFAULT_VRM_PROP_RIG_METRICS } from "./studio-vrm-prop-rig";
import { SELECTABLE_VRM_PROPS } from "./studio-vrm-prop-selection";
import { createPropInstance, propDefById, type PropInstance } from "./studio-vrm-props";
import { StudioVrmPropPanel } from "./StudioVrmPropPanel";

afterEach(cleanup);

function mount(items: PropInstance[] = []) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(<StudioVrmPropPanel vrmReady rigMetrics={DEFAULT_VRM_PROP_RIG_METRICS}
    items={items} selectedUid={items[0]?.uid ?? null} onAdd={onAdd} onRemove={onRemove}
    onUpdate={vi.fn()} onSelect={vi.fn()} onClear={vi.fn()} />);
  return { onAdd, onRemove };
}

function additionButtons() {
  return screen.getAllByRole("button", { hidden: true })
    .filter((button) => button.getAttribute("aria-label")?.includes(" 추가. "));
}

describe("wearable catalogue quality visibility", () => {
  it("uses the same visible count and excludes every withheld item from quick and full lists", () => {
    mount();
    expect(screen.getByText(`${SELECTABLE_VRM_PROPS.length}종`)).toBeDefined();
    for (const id of Object.keys(STUDIO_VRM_PROP_VISUAL_QUARANTINE)) {
      const label = propDefById(id)!.label;
      expect(additionButtons().some((button) => button.getAttribute("aria-label")?.startsWith(`${label} 추가.`))).toBe(false);
    }
    expect(screen.getByText(/품질 개선 중인 소품은 새 추가 목록에서 제외/)).toBeDefined();
  });

  it("keeps excluded saved props editable and removable, with an explicit quality notice", () => {
    const item = createPropInstance("sword", "legacy-quality-sword")!;
    const { onRemove } = mount([item]);
    expect(screen.getByText(`${propDefById("sword")!.label} 편집`)).toBeDefined();
    expect(screen.getByText(/기존 장면의 부착과 편집은 유지됩니다/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: `${propDefById("sword")!.label} 제거` }));
    expect(onRemove).toHaveBeenCalledWith(item.uid);
  });

  it("recommends the replacement microphone and still inserts it through its stable ID", () => {
    const { onAdd } = mount();
    const button = additionButtons().find((candidate) => candidate.getAttribute("aria-label")?.startsWith(`${propDefById("mic")!.label} 추가.`));
    expect(button).toBeDefined();
    fireEvent.click(button!);
    expect(onAdd).toHaveBeenCalledWith("mic");
  });

  it("does not reintroduce withheld proxies when the catalogue is searched", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), { target: { value: propDefById("sword")!.label } });
    expect(additionButtons().some((button) => button.getAttribute("aria-label")?.startsWith(`${propDefById("sword")!.label} 추가.`))).toBe(false);
  });
});
