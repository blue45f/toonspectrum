import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`missing ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`ambiguous ${label}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`missing ${label} start`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`missing ${label} end`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const railPath = "src/domains/creator/StudioLeftToolRail.tsx";
let rail = read(railPath);
rail = replaceOnce(
  rail,
  'import { memo, useEffect, useId, useRef, useState } from "react";',
  'import { memo, useCallback, useEffect, useId, useRef, useState, type SetStateAction } from "react";',
  "rail React import",
);
rail = replaceOnce(
  rail,
  'import { createPortal } from "react-dom";\n',
  `import { createPortal } from "react-dom";\n\nimport {\n  StudioEditorClientProvider,\n  useEditorSelector,\n  useStudioEditorClient,\n} from "./editor-client";\nimport {\n  STUDIO_LEFT_TOOL_RAIL_COMMANDS,\n  type StudioLeftToolRailActionArguments,\n  type StudioLeftToolRailActionName,\n  type StudioLeftToolRailClient,\n  type StudioLeftToolRailHandlersContract,\n  type StudioLeftToolRailSnapshot,\n} from "./editor-client/studio-left-tool-rail-client";\n`,
  "rail EditorClient imports",
);
rail = rail
  .replace("  type StudioAppSettings,\n", "")
  .replace("  type StudioAppSettingsTab,\n", "")
  .replace("  type StudioRailToolId,\n", "")
  .replace(
    `import {\n  isSelectionUsable,\n  type PixelSelection,\n  type SelectionToolKind,\n} from "./studio-selection-tools";`,
    'import { isSelectionUsable } from "./studio-selection-tools";',
  )
  .replace('import type { BubbleVariant } from "./studio-assets";\n', "")
  .replace(
    'import type { DrawMode, DrawShapeKind, StudioMenu, Tool } from "./studio-editor-tool-model";',
    'import type { DrawMode, DrawShapeKind } from "./studio-editor-tool-model";',
  )
  .replace('import type { El } from "./studio-element-model";\n', "");
rail = replaceOnce(
  rail,
  `function labelWithShortcut(label: string, shortcut: string | undefined): string {\n  return shortcut ? \`\${label} (\${formatStudioShortcutChord(shortcut)})\` : label;\n}\n`,
  `function labelWithShortcut(label: string, shortcut: string | undefined): string {\n  return shortcut ? \`\${label} (\${formatStudioShortcutChord(shortcut)})\` : label;\n}\n\nfunction resolveStateAction<T>(next: SetStateAction<T>, current: T): T {\n  return typeof next === "function"\n    ? (next as (value: T) => T)(current)\n    : next;\n}\n`,
  "state action resolver",
);

const handlerStart = "export interface StudioLeftToolRailHandlers {";
const propsStart = "interface StudioLeftToolRailProps {";
const handlerIndex = rail.indexOf(handlerStart);
const propsIndex = rail.indexOf(propsStart, handlerIndex);
if (handlerIndex < 0 || propsIndex < 0) throw new Error("rail contracts not found");
rail = `${rail.slice(0, handlerIndex)}export interface StudioLeftToolRailHandlers\n  extends StudioLeftToolRailHandlersContract {}\n\n${rail.slice(propsIndex)}`;

const header = `export interface StudioLeftToolRailProps {\n  readonly client: StudioLeftToolRailClient;\n}\n\nconst selectStudioLeftToolRailSnapshot = (\n  snapshot: StudioLeftToolRailSnapshot,\n): StudioLeftToolRailSnapshot => snapshot;\n\nexport const StudioLeftToolRail = memo(function StudioLeftToolRail({\n  client,\n}: StudioLeftToolRailProps) {\n  return (\n    <StudioEditorClientProvider client={client}>\n      <StudioLeftToolRailConnected />\n    </StudioEditorClientProvider>\n  );\n});\n\nfunction StudioLeftToolRailConnected() {\n  const snapshot = useEditorSelector(selectStudioLeftToolRailSnapshot);\n  const client = useStudioEditorClient<StudioLeftToolRailSnapshot>();\n  const {\n    activeSurfaceReviewLocked,\n    pixelToolTargetAvailable,\n    rasterRetouchTargetAvailable,\n    advancedFillActive,\n    advancedFillUnsupportedReason,\n    appSettings,\n    appSettingsOpen,\n    canvasOnlyMode,\n    commentPinArmed,\n    cropActive,\n    drawMode,\n    drawShape,\n    eyedropperActive,\n    frameAnimOpen,\n    frameAnimTargetId,\n    isRailToolVisible,\n    liquifyActive,\n    mobileImmersive,\n    perspectiveRulerActive,\n    pixelForceCircle,\n    pixelSel,\n    pixelTool,\n    quickShapeActive,\n    railMoreOpen,\n    referencePanelOpen,\n    mannequinPoserOpen,\n    poserVrmOpen,\n    bg3dOpen,\n    hybridDccOpen,\n    selected,\n    selectedImageMutationLocked,\n    dodgeBurnActive,\n    wetMixActive,\n    smudgeActive,\n    tool,\n    uiDensityMode,\n    viewTransformSuppressed,\n    viewTool,\n  } = snapshot;\n`;
rail = replaceRange(
  rail,
  propsStart,
  "  const railMoreDialogId = useId();",
  `${header}  const railMoreDialogId = useId();`,
  "rail props and component header",
);

const commandBindings = `  const invokeRail = useCallback(\n    function invoke<K extends StudioLeftToolRailActionName>(\n      action: K,\n      ...args: StudioLeftToolRailActionArguments<K>\n    ) {\n      return client.dispatch({\n        id: STUDIO_LEFT_TOOL_RAIL_COMMANDS[action],\n        payload: args,\n        source: "rail",\n      });\n    },\n    [client],\n  );\n\n  function bindVoidAction<K extends StudioLeftToolRailActionName>(\n    action: K,\n  ): (...args: StudioLeftToolRailActionArguments<K>) => void {\n    return (...args) => {\n      void invokeRail(action, ...args);\n    };\n  }\n\n  const setAppSettingsInitialTab = (\n    value: StudioLeftToolRailActionArguments<"setAppSettingsInitialTab">[0],\n  ): void => {\n    void invokeRail("setAppSettingsInitialTab", value);\n  };\n  const setAppSettingsOpen = (next: SetStateAction<boolean>): void => {\n    void invokeRail("setAppSettingsOpen", resolveStateAction(next, appSettingsOpen));\n  };\n  const setDrawShape = (next: SetStateAction<typeof drawShape>): void => {\n    void invokeRail("setDrawShape", resolveStateAction(next, drawShape));\n  };\n  const setEyedropperActive = (next: SetStateAction<boolean>): void => {\n    void invokeRail("setEyedropperActive", resolveStateAction(next, eyedropperActive));\n  };\n  const setMenu = (\n    value: StudioLeftToolRailActionArguments<"setMenu">[0],\n  ): void => {\n    void invokeRail("setMenu", value);\n  };\n  const setPerspectiveRulerActive = (next: SetStateAction<boolean>): void => {\n    void invokeRail(\n      "setPerspectiveRulerActive",\n      resolveStateAction(next, perspectiveRulerActive),\n    );\n  };\n  const setPixelForceCircle = (next: SetStateAction<boolean>): void => {\n    void invokeRail("setPixelForceCircle", resolveStateAction(next, pixelForceCircle));\n  };\n  const setPixelTool = (next: SetStateAction<typeof pixelTool>): void => {\n    void invokeRail("setPixelTool", resolveStateAction(next, pixelTool));\n  };\n  const setQuickShapeActive = (next: SetStateAction<boolean>): void => {\n    void invokeRail("setQuickShapeActive", resolveStateAction(next, quickShapeActive));\n  };\n  const setRailMoreOpen = useCallback((next: SetStateAction<boolean>): void => {\n    void invokeRail("setRailMoreOpen", resolveStateAction(next, railMoreOpen));\n  }, [invokeRail, railMoreOpen]);\n  const setReferencePanelOpen = (next: SetStateAction<boolean>): void => {\n    void invokeRail("setReferencePanelOpen", resolveStateAction(next, referencePanelOpen));\n  };\n  const setMannequinPoserOpen = client.availability(\n    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setMannequinPoserOpen,\n  ).state === "enabled"\n    ? (next: SetStateAction<boolean>): void => {\n        void invokeRail(\n          "setMannequinPoserOpen",\n          resolveStateAction(next, mannequinPoserOpen),\n        );\n      }\n    : undefined;\n  const setPoserVrmOpen = client.availability(\n    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setPoserVrmOpen,\n  ).state === "enabled"\n    ? (next: SetStateAction<boolean>): void => {\n        void invokeRail("setPoserVrmOpen", resolveStateAction(next, poserVrmOpen));\n      }\n    : undefined;\n  const setHybridDccOpen = client.availability(\n    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setHybridDccOpen,\n  ).state === "enabled"\n    ? (next: SetStateAction<boolean>): void => {\n        void invokeRail("setHybridDccOpen", resolveStateAction(next, hybridDccOpen));\n      }\n    : undefined;\n  const setViewTool = (next: SetStateAction<typeof viewTool>): void => {\n    void invokeRail("setViewTool", resolveStateAction(next, viewTool));\n  };\n\n  const activatePrimaryCanvasTool = bindVoidAction("activatePrimaryCanvasTool");\n  const addBubble = bindVoidAction("addBubble");\n  const addText = bindVoidAction("addText");\n  const announceDrawingShortcut = bindVoidAction("announceDrawingShortcut");\n  const clearPolyLassoDraft = bindVoidAction("clearPolyLassoDraft");\n  const commitAppSettings = bindVoidAction("commitAppSettings");\n  const disarmAllPixelTools = bindVoidAction("disarmAllPixelTools");\n  const fitCanvasToWidth = bindVoidAction("fitCanvasToWidth");\n  const fitCanvasToWidthWithFocus = client.availability(\n    STUDIO_LEFT_TOOL_RAIL_COMMANDS.fitCanvasToWidthWithFocus,\n  ).state === "enabled"\n    ? bindVoidAction("fitCanvasToWidthWithFocus")\n    : undefined;\n  const onRequestPixelSelection = bindVoidAction("onRequestPixelSelection");\n  const onRequestSelectImage = bindVoidAction("onRequestSelectImage");\n  const returnToSelectTool = bindVoidAction("returnToSelectTool");\n  const toggleHandTool = bindVoidAction("toggleHandTool");\n  const onPickImage: StudioLeftToolRailHandlers["onPickImage"] = async (...args) => {\n    await invokeRail("onPickImage", ...args);\n  };\n  const revealDrawToolProperties = bindVoidAction("revealDrawToolProperties");\n  const toggleAdvancedFill = bindVoidAction("toggleAdvancedFill");\n  const toggleStudioCommentPinPlacement = bindVoidAction(\n    "toggleStudioCommentPinPlacement",\n  );\n  const toggleDodgeBurnTool = bindVoidAction("toggleDodgeBurnTool");\n  const toggleWetMixTool = bindVoidAction("toggleWetMixTool");\n  const toggleLiquifyTool = bindVoidAction("toggleLiquifyTool");\n  const togglePixelMarquee = bindVoidAction("togglePixelMarquee");\n  const toggleSmudgeTool = bindVoidAction("toggleSmudgeTool");\n  const toggleBg3dEditor = bindVoidAction("toggleBg3dEditor");\n  const openFrameAnimationForSelected = bindVoidAction(\n    "openFrameAnimationForSelected",\n  );\n  const openPixelSelectionTransform = bindVoidAction(\n    "openPixelSelectionTransform",\n  );\n  const openSelectedLayerCrop = bindVoidAction("openSelectedLayerCrop");\n`;
rail = replaceRange(
  rail,
  "  const {\n    activatePrimaryCanvasTool,",
  "\n\n  const fitCanvasToWidthWithWorkspace =",
  `${commandBindings}\n  const fitCanvasToWidthWithWorkspace =`,
  "rail stable handler destructure",
);
rail = replaceOnce(
  rail,
  "onClick={stableHandlers.toggleBg3dEditor}",
  "onClick={toggleBg3dEditor}",
  "BG3D rail handler",
);
if (!/\}\);\s*$/u.test(rail)) throw new Error("rail component tail not found");
rail = rail.replace(/\}\);\s*$/u, "}\n");
write(railPath, rail);

const workspacePath = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx";
let workspace = read(workspacePath);
workspace = replaceOnce(
  workspace,
  'import { Suspense } from "react";\n',
  'import { Suspense } from "react";\nimport { createStudioLeftToolRailClient } from "../editor-client/studio-left-tool-rail-client";\n',
  "workspace client import",
);
workspace = workspace.replace("    setStrokeWidth,\n", "");
const workspaceClient = `  const studioLeftToolRailClient = createStudioLeftToolRailClient({\n    activeSurfaceReviewLocked,\n    pixelToolTargetAvailable,\n    rasterRetouchTargetAvailable,\n    advancedFillActive,\n    advancedFillUnsupportedReason,\n    appSettings,\n    appSettingsOpen,\n    canvasOnlyMode,\n    commentPinArmed: commentPlacementActive,\n    cropActive: cropRect !== null,\n    drawMode,\n    drawShape,\n    eyedropperActive,\n    frameAnimOpen,\n    frameAnimTargetId,\n    isRailToolVisible,\n    liquifyActive,\n    mobileImmersive,\n    perspectiveRulerActive,\n    pixelForceCircle,\n    pixelSel,\n    pixelTool,\n    quickShapeActive,\n    railMoreOpen,\n    referencePanelOpen,\n    mannequinPoserOpen: admittedMannequinPoserOpen,\n    poserVrmOpen: admittedPoserVrmOpen,\n    bg3dOpen: admittedBg3dOpen,\n    hybridDccOpen,\n    selected,\n    selectedImageMutationLocked,\n    dodgeBurnActive,\n    wetMixActive,\n    smudgeActive,\n    tool,\n    uiDensityMode,\n    viewTransformSuppressed,\n    viewTool,\n    setAppSettingsInitialTab,\n    setAppSettingsOpen,\n    setDrawShape,\n    setEyedropperActive,\n    setMenu,\n    setPerspectiveRulerActive,\n    setPixelForceCircle,\n    setPixelTool,\n    setQuickShapeActive,\n    setRailMoreOpen,\n    setReferencePanelOpen,\n    setMannequinPoserOpen,\n    setPoserVrmOpen,\n    setHybridDccOpen,\n    setViewTool,\n    ...studioLeftToolRailHandlers,\n  });\n`;
workspace = replaceOnce(
  workspace,
  "  } = s;\n  return (",
  `  } = s;\n${workspaceClient}  return (`,
  "workspace rail client construction",
);
const railTagPattern = /        <LazyStudioLeftToolRail[\s\S]*?          stableHandlers=\{studioLeftToolRailHandlers\}\n        \/>/u;
if (!railTagPattern.test(workspace)) throw new Error("workspace rail tag not found");
workspace = workspace.replace(
  railTagPattern,
  "        <LazyStudioLeftToolRail client={studioLeftToolRailClient} />",
);
write(workspacePath, workspace);

const testPath = "src/domains/creator/StudioLeftToolRail.test.tsx";
let test = read(testPath);
test = replaceOnce(
  test,
  '} from "./StudioLeftToolRail";\n',
  `} from "./StudioLeftToolRail";\nimport {\n  createStudioLeftToolRailClient,\n  type StudioLeftToolRailClient,\n  type StudioLeftToolRailClientInput,\n} from "./editor-client/studio-left-tool-rail-client";\n`,
  "rail test client import",
);
test = test.replace(
  'import type { ComponentProps, ReactNode } from "react";',
  'import type { ReactNode } from "react";',
);
test = replaceOnce(
  test,
  "type RailProps = ComponentProps<typeof StudioLeftToolRail>;",
  `type RailProps = StudioLeftToolRailClientInput & {\n  readonly client: StudioLeftToolRailClient;\n  readonly stableHandlers: StudioLeftToolRailHandlers;\n  readonly setStrokeWidth: ReturnType<typeof vi.fn>;\n};`,
  "rail test fixture type",
);
const testFactory = `function createProps(overrides: Partial<RailProps> = {}): RailProps {\n  const stableHandlers = overrides.stableHandlers ?? createHandlers();\n  const defaults = {\n    activeSurfaceReviewLocked: false,\n    pixelToolTargetAvailable: true,\n    rasterRetouchTargetAvailable: true,\n    advancedFillActive: false,\n    advancedFillUnsupportedReason: null,\n    appSettings: defaultStudioAppSettings(),\n    appSettingsOpen: false,\n    canvasOnlyMode: false,\n    commentPinArmed: false,\n    cropActive: false,\n    drawMode: "pen" as const,\n    drawShape: "rect" as const,\n    eyedropperActive: false,\n    frameAnimOpen: false,\n    frameAnimTargetId: null,\n    isRailToolVisible: () => true,\n    liquifyActive: false,\n    mobileImmersive: false,\n    perspectiveRulerActive: false,\n    pixelForceCircle: false,\n    pixelSel: null,\n    pixelTool: null,\n    quickShapeActive: false,\n    railMoreOpen: false,\n    referencePanelOpen: false,\n    mannequinPoserOpen: false,\n    poserVrmOpen: false,\n    bg3dOpen: false,\n    hybridDccOpen: false,\n    selected: null,\n    selectedImageMutationLocked: false,\n    setAppSettingsInitialTab: vi.fn(),\n    setAppSettingsOpen: vi.fn(),\n    setDrawShape: vi.fn(),\n    setEyedropperActive: vi.fn(),\n    setMenu: vi.fn(),\n    setPerspectiveRulerActive: vi.fn(),\n    setPixelForceCircle: vi.fn(),\n    setPixelTool: vi.fn(),\n    setQuickShapeActive: vi.fn(),\n    setRailMoreOpen: vi.fn(),\n    setReferencePanelOpen: vi.fn(),\n    setMannequinPoserOpen: vi.fn(),\n    setPoserVrmOpen: vi.fn(),\n    setHybridDccOpen: vi.fn(),\n    setStrokeWidth: vi.fn(),\n    setViewTool: vi.fn(),\n    dodgeBurnActive: false,\n    wetMixActive: false,\n    smudgeActive: false,\n    tool: "select" as const,\n    uiDensityMode: "full" as const,\n    viewTool: null,\n    viewTransformSuppressed: false,\n    stableHandlers,\n  };\n  const merged = { ...defaults, ...overrides, stableHandlers };\n  const input = {\n    ...merged,\n    ...stableHandlers,\n  } as StudioLeftToolRailClientInput;\n\n  return {\n    ...merged,\n    ...stableHandlers,\n    client: createStudioLeftToolRailClient(input),\n  } as RailProps;\n}`;
test = replaceRange(
  test,
  "function createProps(overrides: Partial<RailProps> = {}): RailProps {",
  "\n\nafterEach(() => {",
  `${testFactory}\n\nafterEach(() => {`,
  "rail test fixture factory",
);
test = replaceOnce(
  test,
  `    expect(props.setViewTool).toHaveBeenCalledOnce();\n    const zoomAction = vi.mocked(props.setViewTool).mock.calls.at(-1)?.[0];\n    expect(typeof zoomAction).toBe("function");\n    expect(typeof zoomAction === "function" ? zoomAction(null) : null).toBe("zoom");`,
  `    expect(props.setViewTool).toHaveBeenCalledExactlyOnceWith("zoom");`,
  "resolved view tool command expectation",
);
write(testPath, test);

const boundaryPath = "src/domains/creator/studio-left-tool-rail-boundary.test.ts";
let boundary = read(boundaryPath);
boundary = replaceOnce(
  boundary,
  '  it("keeps the rail independent from canvas render runtimes", () => {',
  `  it("mounts the rail through one EditorClient prop", () => {\n    const rail = moduleShape("./StudioLeftToolRail.tsx");\n    const workspace = moduleShape(\n      "./studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx",\n    );\n\n    expect(rail.source).toContain("readonly client: StudioLeftToolRailClient;");\n    expect(rail.source).not.toContain('import("react").Dispatch<');\n    expect(workspace.source).toContain(\n      "<LazyStudioLeftToolRail client={studioLeftToolRailClient} />",\n    );\n    expect(workspace.source).not.toContain(\n      "stableHandlers={studioLeftToolRailHandlers}",\n    );\n  });\n\n  it("keeps the rail independent from canvas render runtimes", () => {`,
  "rail client boundary test",
);
write(boundaryPath, boundary);

const ratchetPath = "src/domains/creator/studio-host-architecture-ratchet.test.ts";
let ratchet = read(ratchetPath);
ratchet = ratchet.replace(
  /const RAIL_REACT_SETTER_PROPS_MAX = 16;/u,
  "const RAIL_REACT_SETTER_PROPS_MAX = 0;",
);
ratchet = ratchet.replace(
  / \* ratchet: may only decrease\.\n \* 측정 2026-09-02 = 17[\s\S]*? \* \(`selectTool\(\.\.\.\)`\)로 바꿀 때마다 이 숫자를 함께 내린다\.\n \*\//u,
  ` * ratchet: fixed at zero.\n * 2026-09-04: the rail now receives one EditorClient and resolves all state changes through\n * registered commands. Host-owned React setters remain behind the adapter and may not re-enter\n * the component prop contract.\n */`,
);
write(ratchetPath, ratchet);

const indexPath = "src/domains/creator/editor-client/index.ts";
let index = read(indexPath);
if (!index.includes('from "./studio-left-tool-rail-client"')) {
  index = `${index.trimEnd()}\n\nexport {\n  STUDIO_LEFT_TOOL_RAIL_COMMANDS,\n  createStudioLeftToolRailClient,\n} from "./studio-left-tool-rail-client";\nexport type {\n  StudioLeftToolRailActionArguments,\n  StudioLeftToolRailActionName,\n  StudioLeftToolRailActions,\n  StudioLeftToolRailClient,\n  StudioLeftToolRailClientInput,\n  StudioLeftToolRailHandlersContract,\n  StudioLeftToolRailSnapshot,\n} from "./studio-left-tool-rail-client";\n`;
}
write(indexPath, index);

const roadmapPath = "docs/rewrite/architecture-review-roadmap-2026-09-02.md";
let roadmap = read(roadmapPath);
roadmap = replaceOnce(
  roadmap,
  "| P1 | 호스트에 `EditorClient` 배선, 툴 레일 → selector+command 전환 | 진행 | 레일 setter 17 → 16(`setTool` 제거). 목표: 레일이 `EditorClient`만 받음 |",
  "| P1 | 호스트에 `EditorClient` 배선, 툴 레일 → selector+command 전환 | **완료(툴 레일)** | 레일 raw React setter 16 → 0. `StudioLeftToolRail`은 `EditorClient` 하나만 받고 모든 클릭을 CommandRegistry 리시트 경로로 전달 |",
  "roadmap P1 rail status",
);
write(roadmapPath, roadmap);

const clientPath = "src/domains/creator/editor-client/studio-left-tool-rail-client.ts";
let clientSource = read(clientPath);
clientSource = clientSource.replace(
  "StudioLeftToolRailActions[K] extends (...args: infer A) => unknown ? A : never;",
  "NonNullable<StudioLeftToolRailActions[K]> extends (...args: infer A) => unknown ? A : never;",
);
write(clientPath, clientSource);

console.log("applied EditorClient left-tool-rail migration");
