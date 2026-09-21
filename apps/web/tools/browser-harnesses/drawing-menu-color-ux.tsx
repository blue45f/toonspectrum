import { useState } from "react";
import { createRoot } from "react-dom/client";

import { createStudioLeftToolRailClient, type StudioLeftToolRailClientInput } from "../../src/domains/creator/editor-client/studio-left-tool-rail-client";
import { defaultStudioAppSettings, normalizeStudioAppSettings } from "../../src/domains/creator/studio-app-settings";
import { StudioAppSettingsPanel } from "../../src/domains/creator/StudioAppSettingsEditor";
import { StudioDualColorWell } from "../../src/domains/creator/StudioDualColorWell";
import { StudioLeftToolRail } from "../../src/domains/creator/StudioLeftToolRail";
import { StudioPaletteWorkbench } from "../../src/domains/creator/StudioPaletteWorkbench";
import { registerI18nLocaleEntries, useI18n } from "../../src/shared/lib/i18n";
import { STUDIO_I18N_NAMESPACES } from "../../src/shared/lib/i18n-asset-manifest";
import "../../src/styles/globals.css";

// Local-only integration fixture. No document, account or production API is mutated.
const STORAGE_KEY = "drawing-menu-color-ux-harness-v1";
function createInput(): StudioLeftToolRailClientInput {
  return {
    activeSurfaceReviewLocked: false,
    pixelToolTargetAvailable: true,
    rasterRetouchTargetAvailable: true,
    advancedFillActive: false,
    advancedFillUnsupportedReason: null,
    appSettings: defaultStudioAppSettings(),
    appSettingsOpen: false,
    canvasOnlyMode: false,
    commentPinArmed: false,
    cropActive: false,
    drawMode: "pen",
    drawShape: "rect",
    eyedropperActive: false,
    frameAnimOpen: false,
    frameAnimTargetId: null,
    isRailToolVisible: () => true,
    liquifyActive: false,
    mobileImmersive: false,
    perspectiveRulerActive: false,
    pixelForceCircle: false,
    pixelSel: null,
    pixelTool: null,
    quickShapeActive: false,
    railMoreOpen: false,
    referencePanelOpen: false,
    mannequinPoserOpen: false,
    poserVrmOpen: false,
    characterShaperOpen: false,
    bg3dOpen: false,
    hybridDccOpen: false,
    selected: null,
    selectedImageMutationLocked: false,
    dodgeBurnActive: false,
    wetMixActive: false,
    smudgeActive: false,
    tool: "select",
    uiDensityMode: "full",
    viewTransformSuppressed: false,
    viewTool: null,
    activatePrimaryCanvasTool: () => undefined,
    toggleHandTool: () => undefined,
    returnToSelectTool: () => undefined,
    fitCanvasToWidth: () => undefined,
    openFrameAnimationForSelected: () => undefined,
    openPixelSelectionTransform: () => undefined,
    openSelectedLayerCrop: () => undefined,
    toggleBg3dEditor: () => undefined,
    addBubble: () => undefined,
    addText: () => undefined,
    announceDrawingShortcut: () => undefined,
    clearPolyLassoDraft: () => undefined,
    commitAppSettings: () => undefined,
    disarmAllPixelTools: () => undefined,
    onRequestPixelSelection: () => undefined,
    onRequestSelectImage: () => undefined,
    onPickImage: async () => undefined,
    revealDrawToolProperties: () => undefined,
    toggleAdvancedFill: () => undefined,
    toggleDodgeBurnTool: () => undefined,
    toggleWetMixTool: () => undefined,
    toggleLiquifyTool: () => undefined,
    togglePixelMarquee: () => undefined,
    toggleSmudgeTool: () => undefined,
    toggleStudioCommentPinPlacement: () => undefined,
    setAppSettingsInitialTab: () => undefined,
    setAppSettingsOpen: () => undefined,
    setDrawShape: () => undefined,
    setEyedropperActive: () => undefined,
    setMenu: () => undefined,
    setPerspectiveRulerActive: () => undefined,
    setPixelForceCircle: () => undefined,
    setPixelTool: () => undefined,
    setQuickShapeActive: () => undefined,
    setRailMoreOpen: () => undefined,
    setReferencePanelOpen: () => undefined,
    setViewTool: () => undefined,
  };
}

function Harness() {
  const [settings, setSettings] = useState(() => {
    try { return normalizeStudioAppSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); }
    catch { return defaultStudioAppSettings(); }
  });
  const [railMoreOpen, setRailMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [color, setColor] = useState("#397be5");
  const [secondary, setSecondary] = useState("#ffffff");
  const [lastAction, setLastAction] = useState("준비");
  const commitSettings = (next: typeof settings) => {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const input: StudioLeftToolRailClientInput = {
    ...createInput(), appSettings: settings, railMoreOpen, appSettingsOpen: settingsOpen,
    isRailToolVisible: (id) => settings.toolbar.visibleIds.includes(id),
    commitAppSettings: commitSettings, setRailMoreOpen, setAppSettingsOpen: setSettingsOpen,
    activatePrimaryCanvasTool: (tool, mode) => setLastAction(`${tool}:${mode ?? ""}`),
    setReferencePanelOpen: (open) => setLastAction(`reference:${open}`),
    fitCanvasToWidth: () => setLastAction("fit"),
  };
  const client = createStudioLeftToolRailClient(input);
  return <main data-studio-editor="true" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--color-canvas)", color: "var(--color-fg)" }}>
    <header style={{ padding: 12, borderBottom: "1px solid var(--color-line)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <strong>드로잉 도구·색상 UX 검증</strong>
      <button type="button" onClick={() => setSettingsOpen(true)}>도구막대 상세 설정</button>
      <output data-testid="configured-count">{settings.toolbar.visibleIds.length}</output>
    </header>
    <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
      <StudioLeftToolRail client={client} />
      <section style={{ minWidth: 0, flex: 1, overflow: "auto", padding: 16 }}>
        <div style={{ overflowX: "auto", padding: 8 }}>
          <StudioDualColorWell primary={color} secondary={secondary} recent={["#397be5", "#ffcc44", "#cc4466"]}
            onPrimaryChange={setColor} onSecondaryChange={setSecondary}
            onSwap={() => { setColor(secondary); setSecondary(color); }}
            onRequestCanvasEyedropper={() => setLastAction("eyedropper")} />
        </div>
        <output data-testid="current-color">{color}</output> · <output data-testid="last-action">{lastAction}</output>
        <div style={{ height: 200, maxWidth: 600, marginTop: 16, background: "#fff", border: "1px solid var(--color-line)", borderRadius: 12 }} aria-label="검증용 캔버스" />
        <div style={{ maxWidth: 360, marginTop: 20 }}>
          <StudioPaletteWorkbench value={color} recentColors={["#397be5", "#ffcc44", "#cc4466"]}
            onPreviewColor={setColor} onCommitColor={setColor} libraryContent={<p>검증용 팔레트</p>} />
        </div>
      </section>
    </div>
    <StudioAppSettingsPanel open={settingsOpen} settings={settings} initialTab="toolbar"
      onClose={() => setSettingsOpen(false)} onChange={commitSettings}
      onResetAll={() => commitSettings(defaultStudioAppSettings())} />
  </main>;
}

await Promise.all(STUDIO_I18N_NAMESPACES.map(async (namespace) => {
  const response = await fetch(`/i18n/studio/${namespace}/ko.json`);
  registerI18nLocaleEntries("ko", await response.json());
}));
useI18n.setState({ lang: "ko" });
createRoot(document.getElementById("test-root")!).render(<Harness />);
