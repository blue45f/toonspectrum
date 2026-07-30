/**
 * Sole production lazy entry for Babylon Studio code.
 *
 * Callers must import this file dynamically. Babylon deep ESM imports intentionally remain in this
 * entry's static closure so the bundle boundary can prove that opening Studio does not load them.
 */

import { Engine } from "@babylonjs/core/Engines/engine";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";

import { executeStudioBg3dBabylonCapture } from
  "./studio-bg3d-babylon-artifact-capture";
import {
  createStudioBg3dBabylonSpecialistRuntime,
  type StudioBg3dBabylonEngineHandle,
  type StudioBg3dBabylonEngineSettings,
  type StudioBg3dBabylonRuntimeBindings,
  type StudioBg3dBabylonSpecialistRuntime,
  type StudioBg3dBabylonSpecialistRuntimeOptions,
} from "./studio-bg3d-babylon-specialist-runtime";

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

export type StudioBg3dBabylonSpecialistEntryOptions = Omit<
  StudioBg3dBabylonSpecialistRuntimeOptions,
  "loadBindings"
>;

const BABYLON_RUNTIME_BINDINGS: StudioBg3dBabylonRuntimeBindings = Object.freeze({
  createWebGlEngine(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    settings: StudioBg3dBabylonEngineSettings,
  ) {
    return new Engine(canvas, settings.antialias, {
      adaptToDeviceRatio: settings.adaptToDeviceRatio,
      audioEngine: false,
      deterministicLockstep: settings.deterministicLockstep,
      doNotHandleContextLost: false,
      failIfMajorPerformanceCaveat: settings.failIfMajorPerformanceCaveat,
      lockstepMaxSteps: settings.lockstepMaxSteps,
      loseContextOnDispose: true,
      powerPreference: settings.powerPreference,
      premultipliedAlpha: settings.premultipliedAlpha,
      preserveDrawingBuffer: settings.preserveDrawingBuffer,
      stencil: settings.stencil,
      timeStep: settings.timeStepSeconds,
      useHighPrecisionMatrix: true,
    }) as StudioBg3dBabylonEngineHandle;
  },
  async createWebGpuEngine(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    settings: StudioBg3dBabylonEngineSettings,
  ) {
    const engine = new WebGPUEngine(canvas, {
      adaptToDeviceRatio: settings.adaptToDeviceRatio,
      audioEngine: false,
      deterministicLockstep: settings.deterministicLockstep,
      doNotHandleContextLost: false,
      lockstepMaxSteps: settings.lockstepMaxSteps,
      powerPreference: settings.powerPreference,
      premultipliedAlpha: settings.premultipliedAlpha,
      stencil: settings.stencil,
      timeStep: settings.timeStepSeconds,
      useHighPrecisionMatrix: true,
    });
    await engine.initAsync();
    return engine as StudioBg3dBabylonEngineHandle;
  },
  createScene(engine: StudioBg3dBabylonEngineHandle) {
    return new Scene(engine as AbstractEngine);
  },
});

/**
 * The explicit binding loader remains asynchronous even though its ESM closure is already loaded.
 * This keeps engine construction lazy and makes the runtime's initialization seam testable.
 */
export async function loadStudioBg3dBabylonRuntimeBindings():
  Promise<StudioBg3dBabylonRuntimeBindings> {
  return BABYLON_RUNTIME_BINDINGS;
}

export function createStudioBg3dBabylonSpecialist(
  options: StudioBg3dBabylonSpecialistEntryOptions,
): StudioBg3dBabylonSpecialistRuntime {
  return createStudioBg3dBabylonSpecialistRuntime({
    ...options,
    execute: options.execute ?? executeStudioBg3dBabylonCapture,
    loadBindings: loadStudioBg3dBabylonRuntimeBindings,
  });
}

export type {
  StudioBg3dBabylonBackend,
  StudioBg3dBabylonSpecialistExecutionContext,
  StudioBg3dBabylonSpecialistExecutor,
  StudioBg3dBabylonSpecialistRuntime,
  StudioBg3dBabylonSpecialistRuntimeState,
} from "./studio-bg3d-babylon-specialist-runtime";
