import {
  STUDIO_VELLO_CLASSIC_BACKEND_ID,
  type StudioVelloBackendFrame,
  type StudioVelloHubBackendId,
  type StudioVelloHubPresentationTarget,
  type StudioVelloIslandPlacement,
  type StudioVelloSceneIsland,
} from "./studio-vello-hub";

export interface StudioVelloHubCanvasTarget
  extends StudioVelloHubPresentationTarget {
  readonly gpuCanvas: HTMLCanvasElement;
  readonly cpuCanvas: HTMLCanvasElement;
  readonly activeBackendId: StudioVelloHubBackendId | null;
  setIsland(island: StudioVelloSceneIsland): void;
  destroy(): void;
}

function applyCanvasPlacement(
  canvas: HTMLCanvasElement,
  placement: StudioVelloIslandPlacement,
  width: number,
  height: number,
): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.left = `${placement.left}px`;
  canvas.style.top = `${placement.top}px`;
  canvas.style.width = `${placement.width}px`;
  canvas.style.height = `${placement.height}px`;
}

function styleHubCanvas(
  canvas: HTMLCanvasElement,
  backend: "classic" | "cpu",
): void {
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.studioVelloHubSurface = backend;
  canvas.style.background = "transparent";
  canvas.style.display = "none";
  canvas.style.pointerEvents = "none";
  canvas.style.position = "absolute";
  canvas.style.zIndex = "18";
}

/**
 * Two internal canvases form one VelloHub-owned surface. Only a completed
 * backend frame becomes visible; holdLastGood never clears the current one.
 */
export function createStudioVelloHubCanvasTarget(
  ownerDocument: Document,
  mountParent: HTMLElement,
): StudioVelloHubCanvasTarget {
  const gpuCanvas = ownerDocument.createElement("canvas");
  const cpuCanvas = ownerDocument.createElement("canvas");
  styleHubCanvas(gpuCanvas, "classic");
  styleHubCanvas(cpuCanvas, "cpu");
  mountParent.append(gpuCanvas, cpuCanvas);

  let island: StudioVelloSceneIsland | null = null;
  let activeBackendId: StudioVelloHubBackendId | null = null;
  let destroyed = false;
  let configuredDevice: GPUDevice | null = null;
  let configuredWidth = 0;
  let configuredHeight = 0;

  const makePrimary = (
    backendId: StudioVelloHubBackendId,
    primary: HTMLCanvasElement,
    secondary: HTMLCanvasElement,
  ) => {
    primary.style.display = "block";
    primary.dataset.studioVelloHubPrimary = "true";
    secondary.style.display = "none";
    delete secondary.dataset.studioVelloHubPrimary;
    activeBackendId = backendId;
  };

  const target: StudioVelloHubCanvasTarget = {
    gpuCanvas,
    cpuCanvas,
    get activeBackendId() {
      return activeBackendId;
    },
    setIsland(nextIsland) {
      island = nextIsland;
    },
    async present(frame: StudioVelloBackendFrame) {
      if (destroyed || !island) {
        if (frame.kind === "texture") frame.release();
        throw new Error("VelloHub presentation target is unavailable");
      }
      if (frame.width !== island.scene.width || frame.height !== island.scene.height) {
        if (frame.kind === "texture") frame.release();
        throw new Error(
          `VelloHub frame size ${frame.width}x${frame.height} does not match `
          + `${island.scene.width}x${island.scene.height}`,
        );
      }

      if (frame.kind === "pixels") {
        applyCanvasPlacement(
          cpuCanvas,
          island.placement,
          frame.width,
          frame.height,
        );
        const context = cpuCanvas.getContext("2d");
        if (!context) throw new Error("VelloHub CPU canvas 2D context unavailable");
        const ImageDataConstructor = ownerDocument.defaultView?.ImageData
          ?? globalThis.ImageData;
        if (!ImageDataConstructor) {
          throw new Error("VelloHub CPU ImageData constructor unavailable");
        }
        const pixels = new Uint8ClampedArray(frame.pixels);
        context.putImageData(
          new ImageDataConstructor(pixels, frame.width, frame.height),
          0,
          0,
        );
        makePrimary(frame.backendId, cpuCanvas, gpuCanvas);
        return;
      }

      applyCanvasPlacement(
        gpuCanvas,
        island.placement,
        frame.width,
        frame.height,
      );
      const context = gpuCanvas.getContext("webgpu");
      if (!context || typeof GPUTextureUsage === "undefined") {
        frame.release();
        throw new Error("VelloHub WebGPU canvas context unavailable");
      }
      try {
        if (
          configuredDevice !== frame.device
          || configuredWidth !== frame.width
          || configuredHeight !== frame.height
        ) {
          context.configure({
            device: frame.device,
            format: "rgba8unorm",
            alphaMode: "premultiplied",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });
          configuredDevice = frame.device;
          configuredWidth = frame.width;
          configuredHeight = frame.height;
        }
        const destination = context.getCurrentTexture();
        const encoder = frame.device.createCommandEncoder({
          label: "studio-vello-hub-present",
        });
        encoder.copyTextureToTexture(
          { texture: frame.texture },
          { texture: destination },
          { width: frame.width, height: frame.height, depthOrArrayLayers: 1 },
        );
        frame.device.queue.submit([encoder.finish()]);
        makePrimary(frame.backendId, gpuCanvas, cpuCanvas);
        void frame.device.queue.onSubmittedWorkDone().then(
          frame.release,
          frame.release,
        );
      } catch (error) {
        frame.release();
        throw error;
      }
    },
    holdLastGood(reason) {
      const active = activeBackendId === STUDIO_VELLO_CLASSIC_BACKEND_ID
        ? gpuCanvas
        : activeBackendId
          ? cpuCanvas
          : null;
      if (active) active.dataset.studioVelloHubHoldReason = reason;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      gpuCanvas.remove();
      cpuCanvas.remove();
      island = null;
      activeBackendId = null;
    },
  };
  return target;
}
