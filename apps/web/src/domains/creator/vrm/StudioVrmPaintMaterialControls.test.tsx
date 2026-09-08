// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, expect, it } from "vitest";

import { StudioVrmPaintMaterialControls } from "./StudioVrmPaintMaterialControls";
import { createStudioVrmTexturePaintRuntime } from "./studio-vrm-texture-paint-runtime";

afterEach(cleanup);

it("drives real multi-material visibility and restores the remaining material when isolation ends", () => {
  const jacket = new THREE.MeshStandardMaterial({ name: "상의" });
  const boots = new THREE.MeshStandardMaterial({ name: "신발" });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [jacket, boots]));
  const runtime = createStudioVrmTexturePaintRuntime(scene);
  const jacketId = runtime.getSnapshot().materials.find((entry) => entry.label === "상의")!.id;
  const bootsId = runtime.getSnapshot().materials.find((entry) => entry.label === "신발")!.id;
  function Controls() {
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    return <StudioVrmPaintMaterialControls runtime={runtime} snapshot={snapshot} disabled={false} />;
  }
  const view = render(<Controls />);
  fireEvent.change(screen.getByLabelText("표면 페인트 재질"), { target: { value: jacketId } });
  fireEvent.click(screen.getByRole("button", { name: "선택 재질만 보기" }));
  expect([jacket.visible, boots.visible]).toEqual([true, false]);
  fireEvent.change(screen.getByLabelText("표면 페인트 재질"), { target: { value: bootsId } });
  expect([jacket.visible, boots.visible]).toEqual([false, true]);
  fireEvent.click(screen.getByRole("button", { name: "선택 재질 숨기기" }));
  expect([jacket.visible, boots.visible]).toEqual([false, false]);
  fireEvent.click(screen.getByRole("button", { name: "선택 재질 표시" }));
  fireEvent.change(screen.getByLabelText("표면 페인트 재질"), { target: { value: "" } });
  expect([jacket.visible, boots.visible]).toEqual([true, true]);
  expect(runtime.getSnapshot().soloMaterialId).toBeNull();
  view.unmount();
  runtime.dispose();
  scene.children[0]!.removeFromParent();
  jacket.dispose();
  boots.dispose();
});
