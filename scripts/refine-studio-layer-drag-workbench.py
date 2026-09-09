from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{relative}: expected one refinement target, found {count}: {old[:120]!r}"
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


# A layer detached from a group may be dropped beside another *group* row. After detaching,
# reorder it as a root visual unit around the arbitrary target unit instead of requiring the
# target itself to be a root sibling. This preserves both source and target group contiguity.
replace_once(
    "apps/web/src/domains/creator/layer/studio-layer-operations.ts",
    '''          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side,
            { kind: "siblings", groupId: undefined }
          ) as El[];
''',
    '''          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side
          ) as El[];
''',
)

# Lock the detach-then-place contract at the immutable z-order engine boundary.
replace_once(
    "apps/web/src/domains/creator/studio-layers.test.ts",
    '''  it("fails closed for self drops, cross-scope targets, and damaged groups", () => {
''',
    '''  it("places detached children around an arbitrary group unit without splitting either group", () => {
    const input = makeItems([
      { id: "source-a", groupId: "source" },
      { id: "source-b", groupId: "source" },
      "root",
      { id: "target-a", groupId: "target" },
      { id: "target-b", groupId: "target" },
    ]);

    const detached = removeItemsFromGroups(input, ["source-a"]);
    const next = reorderLayerSelectionToTarget(
      detached,
      ["source-a"],
      "target-b",
      "front",
    );

    expect(ids(next)).toEqual([
      "source-b",
      "root",
      "target-a",
      "target-b",
      "source-a",
    ]);
    expect(hasContiguousLayerGroups(next)).toBe(true);
    expect(groupIdOf(next, "source-a")).toBeUndefined();
  });

  it("fails closed for self drops, cross-scope targets, and damaged groups", () => {
''',
)

# React's dragstart render may replace the target node. Bind geometry to the freshly queried
# drop row instead of a prototype or a stale pre-drag element.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    '''    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(layerRow(/주인공 대사/), {
      dataTransfer: transfer,
      clientY: 105,
    });
    const target = layerRow(/주인공 대사/);
''',
    '''    fireEvent.dragStart(handle, { dataTransfer: transfer });
    const target = layerRow(/주인공 대사/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 105 });
''',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    '''    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(layerRow(/캐릭터, 그룹, 2개 레이어/), {
      dataTransfer: transfer,
      clientY: 120,
    });
    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
''',
    '''    fireEvent.dragStart(handle, { dataTransfer: transfer });
    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 120 });
''',
)

print("studio layer drag workbench refinements applied")
