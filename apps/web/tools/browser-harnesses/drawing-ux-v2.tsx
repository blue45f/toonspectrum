import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { StudioColorWorkspaceProvider } from "../../src/domains/creator/color/StudioColorWorkspaceContext";
import { StudioPinnedColorPanel } from "../../src/domains/creator/color/StudioPinnedColorPanel";
import { useStudioSharedColorHistory } from "../../src/domains/creator/color/useStudioSharedColorHistory";
import { createStudioLeftToolRailClient } from "../../src/domains/creator/editor-client/studio-left-tool-rail-client";
import { defaultStudioAppSettings, type StudioAppSettings } from "../../src/domains/creator/studio-app-settings";
import { projectStudioTaskAppSettings } from "../../src/domains/creator/studio-task-tools";
import { acquireProductStudioUiPreferencesRepository } from "../../src/domains/creator/studio-ui-preferences-sqlite";
import { StudioAppSettingsPanel } from "../../src/domains/creator/StudioAppSettingsEditor";
import { StudioColorField } from "../../src/domains/creator/StudioColorField";
import { StudioDualColorWell } from "../../src/domains/creator/StudioDualColorWell";
import { StudioLeftToolRail } from "../../src/domains/creator/StudioLeftToolRail";
import { StudioMobileEditingDock, type StudioMobileSheet } from "../../src/domains/creator/StudioMobileEditingDock";
import { useStudioRecentColors } from "../../src/domains/creator/useStudioRecentColors";
import { registerI18nLocaleEntries, useI18n } from "../../src/shared/lib/i18n";
import { STUDIO_I18N_NAMESPACES } from "../../src/shared/lib/i18n-asset-manifest";

import { createRailInput, createMobileHandlers, createMobileProps } from "./drawing-ux-v2-fixtures";

import type { DrawMode, Tool } from "../../src/domains/creator/studio-editor-tool-model";
import type { El } from "../../src/domains/creator/studio-element-model";
import "../../src/styles/globals.css";

// Isolated browser profile; uses the real SQLite/OPFS repository, not a production account.
function Harness() {
  const [settings, setSettings] = useState(defaultStudioAppSettings);
  const [storage, setStorage] = useState("loading");
  const settingsRevision = useRef(0);
  const [documentId, setDocumentId] = useState("doc-a");
  const [primary, setPrimary] = useState("#397be5");
  const [secondary, setSecondary] = useState("#ffffff");
  const [objectColor, setObjectColor] = useState("#ffcc44");
  const [undoCount, setUndoCount] = useState(0);
  const [strokes, setStrokes] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [railMoreOpen, setRailMoreOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<StudioMobileSheet>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [drawMode, setDrawMode] = useState<DrawMode>("pen");
  const [eyedropper, setEyedropper] = useState(false);
  const [canvasOnly, setCanvasOnly] = useState(false);
  const [action, setAction] = useState("ready");
  const [mobile, setMobile] = useState(() => innerWidth < 1024);
  const sampleRef = useRef<((color: string) => void) | null>(null);
  const { recentColors } = useStudioRecentColors({ ownerScope: "drawing-ux-v2-fixture", onPersistenceUnavailable: () => setStorage("session-only") });
  const history = useStudioSharedColorHistory();
  const elements = useMemo(() => [{ id: "shape-1", type: "draw", kind: "rect", mode: "pen", stroke: objectColor, fill: objectColor, strokeWidth: 2, x: 20, y: 20, w: 200, h: 120, points: [20, 20, 220, 140] } as El], [objectColor]);
  useEffect(() => {
    let active = true;
    const version = settingsRevision.current;
    void acquireProductStudioUiPreferencesRepository().then((repository) => repository.loadAppSettings()).then((loaded) => {
      if (!active) return;
      if (settingsRevision.current === version) setSettings(loaded);
      setStorage("saved");
    }).catch((error: unknown) => { console.error("Fixture settings persistence:", error); if (active) setStorage("session-only"); });
    const resize = () => setMobile(innerWidth < 1024);
    addEventListener("resize", resize);
    return () => { active = false; removeEventListener("resize", resize); };
  }, []);
  const commitSettings = (next: StudioAppSettings) => {
    const revision = ++settingsRevision.current;
    setSettings(next); setStorage("saving");
    void acquireProductStudioUiPreferencesRepository().then((repository) => repository.saveAppSettings(next)).then(() => {
      if (revision === settingsRevision.current) setStorage("saved");
    }).catch(() => { if (revision === settingsRevision.current) setStorage("session-only"); });
  };
  const presented = projectStudioTaskAppSettings(settings, "draw", settings.general.densityMode);
  const client = createStudioLeftToolRailClient({ ...createRailInput(), appSettings: presented,
    uiDensityMode: settings.general.densityMode, canvasOnlyMode: canvasOnly, railMoreOpen, tool, drawMode, eyedropperActive: eyedropper,
    isRailToolVisible: (id) => presented.toolbar.visibleIds.includes(id), commitAppSettings: commitSettings,
    setRailMoreOpen, setAppSettingsOpen: setSettingsOpen,
    activatePrimaryCanvasTool: (next, mode) => { setTool(next); if (mode) setDrawMode(mode); setAction(`${next}:${mode ?? ""}`); },
    setEyedropperActive: setEyedropper, toggleHandTool: () => { setTool("hand"); setAction("hand"); },
    fitCanvasToWidth: () => setAction("fit"), setReferencePanelOpen: () => setAction("reference"),
  });
  const colorValue = {
    ownerKey: documentId, selectionKey: "shape-1", primary, secondary, elements,
    pinned: settings.general.colorPanelPinned === true, isMobile: mobile,
    onPrimaryChange: setPrimary, onSecondaryChange: setSecondary,
    onPinnedChange: (pinned: boolean) => commitSettings({ ...settings, general: { ...settings.general, colorPanelPinned: pinned } }),
    onRevealDock: () => setAction("color-dock"),
    onBeforePopupOpen: () => setMobileSheet(null),
    onRequestSample: (apply: (color: string) => void) => { sampleRef.current = apply; setAction("sample"); },
  };
  const mobileHandlers = { ...createMobileHandlers(),
    activateCanvasTool: (next: Tool, mode?: DrawMode) => { setTool(next); if (mode) setDrawMode(mode); },
    openInspectorRoute: () => setAction("layers"),
  };
  return <StudioColorWorkspaceProvider value={colorValue}>
    <main data-studio-editor="true" data-testid="drawing-fixture" data-persistence={storage}
      data-history-persistence={history.status} className="flex h-[100dvh] min-h-0 flex-col bg-canvas text-fg">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line p-2 text-xs">
        <strong>드로잉 UX 통합 검증</strong>
        <button type="button" className="min-h-11 rounded border border-line px-2" onClick={() => setSettingsOpen(true)}>설정 열기</button>
        <label>밀도 <select aria-label="화면 밀도" value={settings.general.densityMode} className="min-h-11 rounded border border-line bg-panel px-2"
          onChange={(event) => commitSettings({ ...settings, general: { ...settings.general, densityMode: event.currentTarget.value as "full" | "focus" | "simple" } })}>
          <option value="full">전체</option><option value="simple">간단</option><option value="focus">집중</option>
        </select></label>
        <button type="button" className="min-h-11 rounded border border-line px-2" onClick={() => { setDocumentId((id) => id === "doc-a" ? "doc-b" : "doc-a"); setObjectColor("#ffcc44"); }}>문서 전환</button>
        <button type="button" className="min-h-11 rounded border border-line px-2" onClick={() => setCanvasOnly((value) => !value)}>캔버스 전용 전환</button>
        <button type="button" className="min-h-11 rounded border border-line px-2" onClick={() => { sampleRef.current?.("#cc3366"); sampleRef.current = null; }}>샘플 색 적용</button>
      </header>
      <div className="flex min-h-0 flex-1">
        <StudioLeftToolRail client={client} />
        <section className="min-w-0 flex-1 overflow-y-auto p-3 pb-40">
          {!mobile ? <div className="mb-3 overflow-x-auto p-2"><StudioDualColorWell primary={primary} secondary={secondary}
            onPrimaryChange={setPrimary} onSecondaryChange={setSecondary} onSwap={() => { setPrimary(secondary); setSecondary(primary); }} /></div> : null}
          <div className="flex flex-wrap gap-2 text-xs">
            <output data-testid="primary">{primary}</output><output data-testid="secondary">{secondary}</output>
            <output data-testid="recent">{JSON.stringify(recentColors)}</output><output data-testid="pins">{JSON.stringify(settings.toolbar.visibleIds)}</output>
            <output data-testid="undo">{undoCount}</output><output data-testid="strokes">{strokes}</output>
            <output data-testid="tool">{eyedropper ? "eyedropper" : tool}</output><output data-testid="action">{action}</output>
            <output data-testid="document">{documentId}</output>
          </div>
          <div className="my-3 max-w-sm"><StudioColorField label="원고 도형 색" value={objectColor} purpose="fill" recentColors={recentColors}
            onChange={(color) => { if (color) { setObjectColor(color); setUndoCount((count) => count + 1); } }} /></div>
          <button type="button" data-testid="canvas" aria-label="검증용 캔버스"
            className="grid h-64 w-full max-w-2xl place-items-center rounded-lg border border-line bg-white text-black"
            onPointerDown={() => setStrokes((count) => count + 1)}>
            <span className="block h-28 w-40 rounded-xl" data-testid="shape" style={{ background: objectColor }} />
          </button>
        </section>
        {!mobile && settings.general.colorPanelPinned ? <aside className="w-80 shrink-0 overflow-hidden border-l border-line p-2">
          <StudioPinnedColorPanel />
          <section className="mt-3 rounded border border-line p-3 text-sm" aria-label="레이어 검증 목록">선화 · 도형 1</section>
        </aside> : null}
      </div>
      <StudioAppSettingsPanel open={settingsOpen} settings={settings} initialTab="toolbar"
        onClose={() => setSettingsOpen(false)} onChange={commitSettings} onResetAll={() => commitSettings(defaultStudioAppSettings())} />
      <StudioMobileEditingDock {...createMobileProps({ isMobile: mobile, color: primary, tool, drawMode,
        setColor: setPrimary, setTool, setDrawMode, mobileSheet, setMobileSheet, stableHandlers: mobileHandlers,
        brushCatalogHandlers: { close: () => undefined, selectBrushId: () => undefined, toggle: () => setAction("brush-library"), toggleFavorite: () => undefined } })} />
    </main>
  </StudioColorWorkspaceProvider>;
}

await Promise.all(STUDIO_I18N_NAMESPACES.map(async (namespace) => {
  const response = await fetch(`/i18n/studio/${namespace}/ko.json`);
  if (!response.ok) throw new Error(`Locale fixture failed: ${namespace}`);
  registerI18nLocaleEntries("ko", await response.json());
}));
useI18n.setState({ lang: "ko" });
const root = document.getElementById("test-root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Harness />);
