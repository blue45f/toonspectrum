// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestStudioGenerated3dArtifact,
  STUDIO_GENERATED_3D_STATUS_EVENT,
  useStudioGenerated3dHostBridge,
} from "./studio-generated-3d-product-bridge";

function Harness({ openObjectInsert }: { readonly openObjectInsert: () => void }) {
  useStudioGenerated3dHostBridge({ ownerId: "test-host", openObjectInsert });
  return null;
}

afterEach(cleanup);

describe("generated 3D product bridge", () => {
  it("opens the existing importer and dispatches a GLB file change", async () => {
    const openObjectInsert = vi.fn(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".glb,model/gltf-binary";
      document.body.append(input);
    });
    const status = vi.fn();
    globalThis.addEventListener(STUDIO_GENERATED_3D_STATUS_EVENT, status);
    render(<Harness openObjectInsert={openObjectInsert} />);

    act(() => {
      requestStudioGenerated3dArtifact({
        intent: "insert",
        revisionId: `3drev_${"a".repeat(24)}`,
        blob: new Blob([new Uint8Array(32).fill(1)], { type: "model/gltf-binary" }),
      });
    });

    await waitFor(() => expect(openObjectInsert).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      expect(input?.dataset.generated3dIntent).toBe("insert");
      expect(input?.files?.[0]?.name).toMatch(/^3drev_.*\.glb$/u);
    });
    globalThis.removeEventListener(STUDIO_GENERATED_3D_STATUS_EVENT, status);
  });

  it("rejects invalid revisions before opening the product importer", () => {
    render(<Harness openObjectInsert={vi.fn()} />);
    expect(() =>
      requestStudioGenerated3dArtifact({
        intent: "insert",
        revisionId: "invalid",
        blob: new Blob([new Uint8Array(32)]),
      }),
    ).toThrow(/revision identity/u);
  });
});
