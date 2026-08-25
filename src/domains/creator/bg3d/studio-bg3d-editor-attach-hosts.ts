/* Extracted from StudioBackground3D. Closures keep original identifiers via an `any` host bag. */
// @ts-nocheck
import { attachStudioBg3dEditorSessionHost } from "./studio-bg3d-editor-session-host";
import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { attachStudioBg3dEditorTransformHost } from "./studio-bg3d-editor-transform-host";
import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { attachStudioBg3dEditorLtHost } from "./studio-bg3d-editor-lt-host";
import { attachStudioBg3dEditorShotHost } from "./studio-bg3d-editor-shot-host";
import { attachStudioBg3dEditorCaptureHost } from "./studio-bg3d-editor-capture-host";
import { attachStudioBg3dEditorInsertHost } from "./studio-bg3d-editor-insert-host";
import { attachStudioBg3dEditorGenericHost } from "./studio-bg3d-editor-generic-host";
import { attachStudioBg3dEditorMeasureHost } from "./studio-bg3d-editor-measure-host";
import { attachStudioBg3dEditorPhysicsHost } from "./studio-bg3d-editor-physics-host";
import { attachStudioBg3dEditorMiscHost } from "./studio-bg3d-editor-misc-host";

export function attachStudioBg3dEditorHosts(h) {
  attachStudioBg3dEditorSessionHost(h);
  attachStudioBg3dEditorSceneOpsHost(h);
  attachStudioBg3dEditorTransformHost(h);
  attachStudioBg3dEditorPlacementHost(h);
  attachStudioBg3dEditorLtHost(h);
  attachStudioBg3dEditorShotHost(h);
  attachStudioBg3dEditorCaptureHost(h);
  attachStudioBg3dEditorInsertHost(h);
  attachStudioBg3dEditorGenericHost(h);
  attachStudioBg3dEditorMeasureHost(h);
  attachStudioBg3dEditorPhysicsHost(h);
  attachStudioBg3dEditorMiscHost(h);
}
