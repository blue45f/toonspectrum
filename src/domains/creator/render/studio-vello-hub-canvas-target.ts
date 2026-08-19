import {
  type StudioVelloBackendFrame,
  type StudioVelloHubBackendId,
  type StudioVelloHubPresentationTarget,
  type StudioVelloIslandPlacement,
  type StudioVelloSceneIsland,
} from "./studio-vello-hub";

export interface StudioVelloHubCanvasTarget
  extends StudioVelloHubPresentationTarget {
  readonly canvas: HTMLCanvasElement;
  /** @deprecated V13 uses a single canvas; alias of `canvas`. */
  readonly gpuCanvas: HTMLCanvasElement;
  /** @deprecated V13 uses a single canvas; alias of `canvas`. */
  readonly cpuCanvas: HTMLCanvasElement;
  readonly activeBackendId: StudioVelloHubBackendId | null;
  setIsland(island: StudioVelloSceneIsland): void;
  /** Stop the retain-present loop and release the swapchain when nothing is shown. */
  park(): void;
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

function styleHubCanvas(canvas: HTMLCanvasElement): void {
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.studioVelloHubSurface = "frame-graph";
  canvas.style.background = "transparent";
  canvas.style.display = "none";
  canvas.style.pointerEvents = "none";
  canvas.style.position = "absolute";
}

/**
 * One visible canvas. GPU frames copy on-device; CPU recovery uploads pixels
 * into the same WebGPU swapchain so a second DOM canvas is never created.
 * Empty mixed pages call `park()` so the retain-present rAF loop does not
 * copy a viewport-sized swapchain every frame.
 */
export function createStudioVelloHubCanvasTarget(
  ownerDocument: Document,
  mountParent: HTMLElement,
): StudioVelloHubCanvasTarget {
  const canvas = ownerDocument.createElement("canvas");
  styleHubCanvas(canvas);
  const content = mountParent.querySelector(".konvajs-content");
  if (content?.firstElementChild) {
    content.insertBefore(canvas, content.children[1] ?? null);
  } else {
    mountParent.append(canvas);
  }

  let island: StudioVelloSceneIsland | null = null;
  let activeBackendId: StudioVelloHubBackendId | null = null;
  let destroyed = false;
  let configuredDevice: GPUDevice | null = null;
  let configuredWidth = 0;
  let configuredHeight = 0;
  let retainedTexture: GPUTexture | null = null;
  let presentFrame = 0;
  let loopDevice: GPUDevice | null = null;
  let loopContext: GPUCanvasContext | null = null;

  const markPrimary = (backendId: StudioVelloHubBackendId) => {
    canvas.style.display = "block";
    canvas.dataset.studioVelloHubPrimary = "true";
    activeBackendId = backendId;
    canvas.dataset.studioVelloPresentNodes = String(island?.scene.nodes.length ?? 0);
  };

  const destroyRetainedTexture = () => {
    try {
      retainedTexture?.destroy();
    } catch {
      // Lost devices may already have invalidated the retained texture.
    }
    retainedTexture = null;
  };

  const stopPresentLoop = () => {
    const view = ownerDocument.defaultView;
    if (presentFrame && view) view.cancelAnimationFrame(presentFrame);
    presentFrame = 0;
  };

  const blitRetained = (device: GPUDevice, context: GPUCanvasContext) => {
    if (!retainedTexture) return;
    const encoder = device.createCommandEncoder({
      label: "studio-frame-graph-retain-present",
    });
    encoder.copyTextureToTexture(
      { texture: retainedTexture },
      { texture: context.getCurrentTexture() },
      {
        width: retainedTexture.width,
        height: retainedTexture.height,
        depthOrArrayLayers: 1,
      },
    );
    device.queue.submit([encoder.finish()]);
  };

  const startPresentLoop = (device: GPUDevice, context: GPUCanvasContext) => {
    const view = ownerDocument.defaultView;
    if (!view) return;
    loopDevice = device;
    loopContext = context;
    stopPresentLoop();
    if (ownerDocument.hidden) return;
    const tick = () => {
      presentFrame = 0;
      if (destroyed || !retainedTexture || ownerDocument.hidden) return;
      try {
        blitRetained(device, context);
      } catch {
        // Device loss or a missing swapchain image; the next present restarts.
      }
      if (!destroyed && retainedTexture && !ownerDocument.hidden) {
        presentFrame = view.requestAnimationFrame(tick);
      }
    };
    presentFrame = view.requestAnimationFrame(tick);
  };

  const onVisibilityChange = () => {
    if (destroyed) return;
    if (ownerDocument.hidden) {
      stopPresentLoop();
      return;
    }
    if (loopDevice && loopContext && retainedTexture) {
      startPresentLoop(loopDevice, loopContext);
    }
  };
  ownerDocument.addEventListener("visibilitychange", onVisibilityChange);

  const park = () => {
    stopPresentLoop();
    destroyRetainedTexture();
    loopDevice = null;
    loopContext = null;
    configuredDevice = null;
    configuredWidth = 0;
    configuredHeight = 0;
    if (canvas.width !== 1) canvas.width = 1;
    if (canvas.height !== 1) canvas.height = 1;
    canvas.style.display = "none";
    delete canvas.dataset.studioVelloHubPrimary;
    canvas.dataset.studioVelloPresentNodes = "0";
  };

  const retainTexture = (device: GPUDevice, width: number, height: number) => {
    if (
      retainedTexture
      && retainedTexture.width === width
      && retainedTexture.height === height
    ) {
      return retainedTexture;
    }
    destroyRetainedTexture();
    retainedTexture = device.createTexture({
      label: "studio-frame-graph-retained",
      size: { width, height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });
    return retainedTexture;
  };

  const presentPixelsOnGpu = (
    frame: Extract<StudioVelloBackendFrame, { kind: "pixels" }>,
    device: GPUDevice,
    context: GPUCanvasContext,
  ) => {
    const retained = retainTexture(device, frame.width, frame.height);
    device.queue.writeTexture(
      { texture: retained },
      frame.pixels,
      { bytesPerRow: frame.width * 4 },
      { width: frame.width, height: frame.height },
    );
    blitRetained(device, context);
    startPresentLoop(device, context);
  };

  const target: StudioVelloHubCanvasTarget = {
    canvas,
    gpuCanvas: canvas,
    cpuCanvas: canvas,
    get activeBackendId() {
      return activeBackendId;
    },
    setIsland(nextIsland) {
      island = nextIsland;
    },
    park,
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

      applyCanvasPlacement(canvas, island.placement, frame.width, frame.height);

      if (frame.kind === "texture") {
        const context = canvas.getContext("webgpu");
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
          const retained = retainTexture(frame.device, frame.width, frame.height);
          const encoder = frame.device.createCommandEncoder({
            label: "studio-vello-hub-present",
          });
          encoder.copyTextureToTexture(
            { texture: frame.texture },
            { texture: retained },
            { width: frame.width, height: frame.height, depthOrArrayLayers: 1 },
          );
          frame.device.queue.submit([encoder.finish()]);
          blitRetained(frame.device, context);
          startPresentLoop(frame.device, context);
          markPrimary(frame.backendId);
          void frame.device.queue.onSubmittedWorkDone().then(
            frame.release,
            frame.release,
          );
        } catch (error) {
          frame.release();
          throw error;
        }
        return;
      }

      if (configuredDevice && typeof GPUTextureUsage !== "undefined") {
        const context = canvas.getContext("webgpu");
        if (!context) throw new Error("VelloHub WebGPU canvas context unavailable");
        presentPixelsOnGpu(frame, configuredDevice, context);
        markPrimary(frame.backendId);
        return;
      }

      const context2d = canvas.getContext("2d");
      if (!context2d) throw new Error("VelloHub canvas 2D context unavailable");
      const ImageDataConstructor = ownerDocument.defaultView?.ImageData
        ?? globalThis.ImageData;
      if (!ImageDataConstructor) {
        throw new Error("VelloHub CPU ImageData constructor unavailable");
      }
      context2d.putImageData(
        new ImageDataConstructor(new Uint8ClampedArray(frame.pixels), frame.width, frame.height),
        0,
        0,
      );
      markPrimary(frame.backendId);
    },
    holdLastGood(reason) {
      if (activeBackendId) canvas.dataset.studioVelloHubHoldReason = reason;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ownerDocument.removeEventListener("visibilitychange", onVisibilityChange);
      stopPresentLoop();
      destroyRetainedTexture();
      loopDevice = null;
      loopContext = null;
      canvas.remove();
      island = null;
      activeBackendId = null;
    },
  };
  return target;
}
