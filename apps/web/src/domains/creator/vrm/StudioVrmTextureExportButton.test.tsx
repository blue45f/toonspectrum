// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";

import { StudioVrmTextureExportButton } from "./StudioVrmTextureExportButton";
import { createStudioVrmTexturePaintRuntime } from "./studio-vrm-texture-paint-runtime";

vi.mock("../export/studio-export", () => ({ downloadBlob: vi.fn() }));

afterEach(cleanup);

it("clears the previous model's export failure only when the active runtime changes", async () => {
  const first = createStudioVrmTexturePaintRuntime(new THREE.Group());
  const second = createStudioVrmTexturePaintRuntime(new THREE.Group());
  const view = render(<StudioVrmTextureExportButton runtime={first} disabled={false} />);
  try {
    // Exercise the real lazy export service: an unpainted model has no ZIP entries.
    fireEvent.click(screen.getByRole("button", { name: "텍스처 ZIP 내보내기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("내보낼 표면 페인팅이 없습니다.");
    expect(screen.getByRole("button", { name: "텍스처 ZIP 내보내기" }).hasAttribute("disabled")).toBe(false);

    // An unrelated render must retain the actionable failure on the same model.
    view.rerender(<StudioVrmTextureExportButton runtime={first} disabled />);
    expect(screen.getByRole("alert").textContent).toBe("내보낼 표면 페인팅이 없습니다.");

    view.rerender(<StudioVrmTextureExportButton runtime={second} disabled={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "텍스처 ZIP 내보내기" }).hasAttribute("disabled")).toBe(false);

    view.rerender(<StudioVrmTextureExportButton runtime={first} disabled={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
    view.rerender(<StudioVrmTextureExportButton runtime={second} disabled={false} />);

    // The replacement model can report its own export failure normally.
    fireEvent.click(screen.getByRole("button", { name: "텍스처 ZIP 내보내기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("내보낼 표면 페인팅이 없습니다.");
    view.rerender(<StudioVrmTextureExportButton runtime={null} disabled={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
  } finally {
    view.unmount();
    first.dispose();
    second.dispose();
  }
});
