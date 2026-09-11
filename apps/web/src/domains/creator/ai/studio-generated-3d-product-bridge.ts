import { useEffect } from "react";

export type StudioGenerated3dIntent = "insert" | "save" | "texture-edit";

export interface StudioGenerated3dArtifactRequest {
  readonly intent: StudioGenerated3dIntent;
  readonly blob: Blob;
  readonly revisionId: string;
}

export interface StudioGenerated3dBridgeStatus {
  readonly intent: StudioGenerated3dIntent;
  readonly revisionId: string;
  readonly status: "accepted" | "failed";
  readonly message: string;
}

export const STUDIO_GENERATED_3D_REQUEST_EVENT = "toonstudio:generated-3d-request";
export const STUDIO_GENERATED_3D_STATUS_EVENT = "toonstudio:generated-3d-status";

function validRevisionId(value: string): string {
  const normalized = value.trim();
  if (!/^3drev_[a-f0-9]{16,64}$/u.test(normalized)) {
    throw new TypeError("Generated 3D artifact revision identity is invalid.");
  }
  return normalized;
}

export function requestStudioGenerated3dArtifact(
  request: StudioGenerated3dArtifactRequest,
): void {
  if (!(request.blob instanceof Blob) || request.blob.size < 20 || request.blob.size > 500 * 1024 * 1024) {
    throw new RangeError("Generated 3D artifact byte size is invalid.");
  }
  const revisionId = validRevisionId(request.revisionId);
  globalThis.dispatchEvent(
    new CustomEvent<StudioGenerated3dArtifactRequest>(STUDIO_GENERATED_3D_REQUEST_EVENT, {
      detail: Object.freeze({ ...request, revisionId }),
    }),
  );
}

function emitStatus(status: StudioGenerated3dBridgeStatus): void {
  globalThis.dispatchEvent(
    new CustomEvent<StudioGenerated3dBridgeStatus>(STUDIO_GENERATED_3D_STATUS_EVENT, {
      detail: Object.freeze(status),
    }),
  );
}

function generatedFile(blob: Blob, revisionId: string): File {
  return new File([blob], `${revisionId}.glb`, {
    type: blob.type.includes("gltf") ? blob.type : "model/gltf-binary",
    lastModified: Date.now(),
  });
}

function assignFile(input: HTMLInputElement, file: File): void {
  if (typeof DataTransfer === "function") {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  } else {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: Object.freeze([file]),
    });
  }
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

async function waitForExistingGlbInput(signal: AbortSignal): Promise<HTMLInputElement> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (signal.aborted) throw new DOMException("Generated 3D import was cancelled.", "AbortError");
    const input = document.querySelector<HTMLInputElement>(
      '[data-studio-object-insert] input[type="file"], input[type="file"][accept*=".glb"], input[type="file"][accept*="gltf"]',
    );
    if (input && !input.disabled) return input;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error("The existing Studio 3D import input did not become available.");
}

export function useStudioGenerated3dHostBridge(input: {
  readonly ownerId: string;
  readonly openObjectInsert: () => void | Promise<void>;
}): void {
  const { ownerId, openObjectInsert } = input;
  useEffect(() => {
    const active = new Set<AbortController>();
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as StudioGenerated3dArtifactRequest | undefined;
      if (!detail) return;
      const controller = new AbortController();
      active.add(controller);
      void (async () => {
        try {
          const revisionId = validRevisionId(detail.revisionId);
          await openObjectInsert();
          const fileInput = await waitForExistingGlbInput(controller.signal);
          assignFile(fileInput, generatedFile(detail.blob, revisionId));
          fileInput.dataset.generated3dIntent = detail.intent;
          fileInput.dataset.generated3dRevision = revisionId;
          emitStatus({
            intent: detail.intent,
            revisionId,
            status: "accepted",
            message: "Generated GLB entered the existing Studio 3D import pipeline.",
          });
        } catch (error) {
          emitStatus({
            intent: detail.intent,
            revisionId: detail.revisionId,
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          active.delete(controller);
        }
      })();
    };
    globalThis.addEventListener(STUDIO_GENERATED_3D_REQUEST_EVENT, listener);
    return () => {
      globalThis.removeEventListener(STUDIO_GENERATED_3D_REQUEST_EVENT, listener);
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, [openObjectInsert, ownerId]);
}
