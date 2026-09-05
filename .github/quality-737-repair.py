from pathlib import Path

root = Path('.')
base = root / 'src/domains/creator'

def replace(path, old, new, count=1):
    source = path.read_text()
    found = source.count(old)
    if found != count:
        raise RuntimeError(f'{path}: expected {count} anchors, found {found}: {old[:100]!r}')
    path.write_text(source.replace(old, new))

core = base / 'studio-quality-inspection.ts'
replace(core, '  const name = page.name?.trim();', '  const name = typeof page.name === "string" ? page.name.trim() : "";')
replace(core, '      const el = page.elements[elementIndex]!;', '''      const sourceElement = page.elements[elementIndex]!;
      const invalidText =
        (sourceElement.type === "text" || sourceElement.type === "bubble" || sourceElement.type === "sticker") &&
        typeof sourceElement.text !== "string";
      // Restored fields are untrusted. Normalize once before every geometry/lettering read,
      // keep the stored object untouched, and never turn malformed content into a pass.
      const el: El = invalidText ? { ...sourceElement, text: "" } as El : sourceElement;
      if (invalidText) {
        add({
          code: "INVALID_DIALOGUE_CHARACTER",
          category: "lettering",
          severity: "blocking",
          title: "텍스트 데이터 형식 손상",
          message: `${pageName}의 ${sourceElement.type} 요소에 문자열이 아닌 텍스트가 저장되어 있습니다.`,
          remediation: "원문을 복구하거나 해당 요소를 다시 생성하세요.",
          pageId: page.id,
          pageIndex,
          elementId: typeof sourceElement.id === "string" ? sourceElement.id : undefined,
          idSuffix: `invalid-text:${elementIndex}`,
        });
      }''')
replace(core, r'  if (/[\u0000\uFFFD]/u.test(text)) {', r'  if (text.includes("\u0000") || text.includes("\uFFFD")) {')
replace(core, '    ? Math.floor(options.maxIssues)', '    ? Math.max(1, Math.floor(options.maxIssues))')
# A sampled string misses edits between samples; review receipts must see the full content.
source = core.read_text()
start = source.index('function boundedRevisionString(')
end = source.index('function updateRevisionHash(\n', start)
source = source[:start] + source[end:]
source = source.replace('return updateRevisionHashWithText(hash, `"${boundedRevisionString(value)}";`);', '''// Hash every code unit without constructing a second full data-URL string.
      return updateRevisionHashWithText(
        updateRevisionHashWithText(updateRevisionHashWithText(hash, '"'), value),
        '";'
      );''')
assert 'boundedRevisionString' not in source
core.write_text(source)

panel = base / 'StudioContinuityPanel.tsx'
replace(panel, 'function safeStorageKey(documentKey: string | undefined): string {\n  const normalized = documentKey?.trim() || "local-draft";\n  return `toonstudio:quality-inspection:v1:${normalized.slice(0, 180)}`;\n}', '''function safeStorageKey(documentKey: string | undefined): string | null {
  const normalized = documentKey?.trim();
  // Never let anonymous drafts or truncated keys share a review receipt. v2 intentionally
  // does not import v1 decisions, whose document/revision ownership was not guaranteed.
  return normalized ? `toonstudio:quality-inspection:v2:${encodeURIComponent(normalized)}` : null;
}''')
replace(panel, '''function readPersistedState(storageKey: string): PersistedQualityState {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as PersistedQualityState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}''', '''function readPersistedState(storageKey: string | null): PersistedQualityState {
  if (storageKey === null || typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return {
      acknowledgedIssueIds: Array.isArray(record.acknowledgedIssueIds)
        ? record.acknowledgedIssueIds.filter((id): id is string => typeof id === "string")
        : [],
      manualCheckIds: Array.isArray(record.manualCheckIds)
        ? record.manualCheckIds.filter((id): id is ManualCheckId =>
            MANUAL_CHECKS.some((check) => check.id === id))
        : [],
      manualRevisionKey: typeof record.manualRevisionKey === "string" ? record.manualRevisionKey : undefined,
    };
  } catch {
    return {};
  }
}''')
replace(panel, 'export function StudioContinuityPanel({', 'const EMPTY_PAGES: readonly PageState[] = [];\n\nexport function StudioContinuityPanel({')
replace(panel, '  pages = [],', '  pages = EMPTY_PAGES,')
replace(panel, '  const [acknowledgedIssueIds, setAcknowledgedIssueIds]', '  const [storedAcknowledgedIssueIds, setAcknowledgedIssueIds]')
replace(panel, '  const [completedManualChecks, setCompletedManualChecks]', '  const [storedCompletedManualChecks, setCompletedManualChecks]')
replace(panel, '''  const report = useMemo(
    () =>
      inspectStudioQuality({
        pages,''', '''  // A rescan is a new measurement request even when the immutable pages did not change.
  const scanInput = useMemo(() => ({ pages, epoch: scanEpoch }), [pages, scanEpoch]);
  const report = useMemo(
    () =>
      inspectStudioQuality({
        pages: scanInput.pages,''')
replace(panel, '''    // scanEpoch intentionally retries browser font measurement after fonts/resources settle.
    [issues, openCommentCount, pages, rasterInspection, scanEpoch]
  );''', '''    [issues, openCommentCount, scanInput, rasterInspection]
  );
  const currentReviewKey = `${storageKey}:${report.revisionKey}`;
  const acknowledgedIssueIds = useMemo(() => new Set(
    loadedStorageKey === currentReviewKey
      ? report.issues.filter((issue) =>
          (issue.severity === "warning" || issue.severity === "review") &&
          storedAcknowledgedIssueIds.has(issue.id)).map((issue) => issue.id)
      : []
  ), [currentReviewKey, loadedStorageKey, report.issues, storedAcknowledgedIssueIds]);
  const completedManualChecks = useMemo(() =>
    loadedStorageKey === currentReviewKey ? storedCompletedManualChecks : new Set<ManualCheckId>(),
    [currentReviewKey, loadedStorageKey, storedCompletedManualChecks]
  );''')
replace(panel, '    void inspectStudioRasterAssets(pages, {', '    void inspectStudioRasterAssets(scanInput.pages, {')
replace(panel, '      onProgress: setRasterProgress,', '''      onProgress: (progress) => {
        if (!controller.signal.aborted) setRasterProgress(progress);
      },''')
replace(panel, '        if (result.status !== "aborted") setRasterInspection(result);', '        if (!controller.signal.aborted && result.status !== "aborted") setRasterInspection(result);')
replace(panel, '  }, [open, pages, scanEpoch]);', '  }, [open, scanInput]);')
replace(panel, '    setAcknowledgedIssueIds(new Set(persisted.acknowledgedIssueIds ?? []));', '''    setAcknowledgedIssueIds(new Set(
      persisted.manualRevisionKey === report.revisionKey ? persisted.acknowledgedIssueIds ?? [] : []
    ));''')
replace(panel, '''      loadedStorageKey !== `${storageKey}:${report.revisionKey}` ||
      typeof localStorage''', '''      storageKey === null ||
      loadedStorageKey !== `${storageKey}:${report.revisionKey}` ||
      typeof localStorage''')
replace(panel, '  const rasterPending = hasRasterReferences && (rasterBusy || rasterInspection === null);', '''  // Missing capability, failed probes and incomplete coverage are not a successful scan.
  const rasterPending = hasRasterReferences && (
    rasterBusy || rasterInspection?.status !== "complete" || rasterInspection.skippedSourceCount > 0
  );''')

stack = base / 'StudioLazyPanelStack.tsx'
replace(stack, '  memo,\n', '  memo,\n  useContext,\n')
replace(stack, 'import { selectWheelColors }', 'import { StudioDocumentRuntimeContext } from "./studio-router/studio-document-runtime-context";\nimport { selectWheelColors }')
replace(stack, '  const teamWorkId = workId ?? (', '  const documentRuntime = useContext(StudioDocumentRuntimeContext);\n  const teamWorkId = workId ?? (')
replace(stack, '            documentKey={workId ?? `draft:${title}`}', '''            documentKey={documentRuntime?.documentKey ?? (
              workId ? JSON.stringify(["work", studioAuthUserId ?? "guest", workId]) : undefined
            )}''')
replace(stack, '              setCurrentPageId(scene.pageId);', '              if (!setCurrentPageId(scene.pageId)) return;')
replace(stack, '              if (target.pageId) setCurrentPageId(target.pageId);', '              if (target.pageId && !setCurrentPageId(target.pageId)) return;')

test = base / 'StudioContinuityPanel.test.tsx'
replace(test, '''    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-studio-quality-inspection",
      "true"
    );''', '''    expect(screen.getByRole("dialog").getAttribute("data-studio-quality-inspection")).toBe("true");''')
replace(test, 'expect(screen.getByText("마감·품질 검사 센터")).toBeInTheDocument();', 'expect(screen.getByText("마감·품질 검사 센터")).not.toBeNull();')
replace(test, 'expect(screen.getByText("최종 수동 확인")).toBeInTheDocument();', 'expect(screen.getByText("최종 수동 확인")).not.toBeNull();')
replace(test, '''    expect(
      screen.getByRole("button", { name: "확인 취소" })
    ).toHaveAttribute("aria-pressed", "true");''', '''    fireEvent.click(screen.getByRole("checkbox", { name: /확인됨/u }));
    expect(screen.getByRole("button", { name: "확인 취소" }).getAttribute("aria-pressed")).toBe("true");''')
replace(test, '    fireEvent.click(await screen.findByRole("button", { name: "위치로 이동" }));', '''    const missingSource = (await screen.findByText("이미지 원본 누락")).closest("li");
    expect(missingSource).not.toBeNull();
    fireEvent.click(within(missingSource!).getByRole("button", { name: "위치로 이동" }));''')

(base / 'studio-quality-inspection-hardening.test.ts').write_text('''import { describe, expect, it } from "vitest";

import { computeStudioQualityRevisionKey, inspectStudioQuality } from "./studio-quality-inspection";

import type { El } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

function page(elements: El[]): PageState {
  return { id: "page", elements, canvasH: 800, bg: "#fff", bgGrad: null,
    review: { status: "approved", locked: true } };
}

const measurer = { measureWidth: (text: string, size: number) => [...text].length * size };

describe("quality inspection corrupted-content admission", () => {
  for (const type of ["text", "bubble", "sticker"] as const) {
    for (const hidden of [false, true]) {
      it.each([null, undefined, 42, {}, ["not", "a", "string"]])(
        `${type} hidden=${hidden} rejects non-string text without throwing: %j`, (text) => {
          const element = { id: "broken", type, text, hidden, x: 20, y: 20,
            width: 300, height: 200, rotation: 0, fontSize: 24, fill: "#fff", textFill: "#000",
            variant: "speech" } as unknown as El;
          const document = page([element]);
          const report = inspectStudioQuality({ pages: [document] }, { textMeasurer: measurer });
          expect(report.canFinalize).toBe(false);
          expect(report.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: "INVALID_DIALOGUE_CHARACTER", severity: "blocking", elementId: "broken" }),
          ]));
          expect(document.elements[0]).toBe(element);
          expect((element as unknown as { text: unknown }).text).toBe(text);
        }
      );
    }
  }

  it("keeps invalid geometry findings alongside malformed text", () => {
    const element = { id: "broken", type: "text", text: 1, x: NaN, y: 20,
      width: 300, fontSize: 24, fill: "#000", rotation: 0 } as unknown as El;
    const report = inspectStudioQuality({ pages: [page([element])] }, { textMeasurer: measurer });
    expect(report.issues.some((issue) => issue.code === "INVALID_ELEMENT_GEOMETRY")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "INVALID_DIALOGUE_CHARACTER")).toBe(true);
  });

  it.each(["\\u0000", "\\uFFFD"])("reports corrupt code units %j", (character) => {
    const element = { id: "text", type: "text", text: `안녕${character}`, x: 20, y: 20,
      width: 300, fontSize: 24, fill: "#000", rotation: 0 } as El;
    expect(inspectStudioQuality({ pages: [page([element])] }, { textMeasurer: measurer }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_DIALOGUE_CHARACTER" })]));
  });

  it("does not allow a fractional issue limit to hide all blockers", () => {
    const report = inspectStudioQuality({ pages: [] }, { maxIssues: 0.2 });
    expect(report.canFinalize).toBe(false);
    expect(report.issues.some((issue) => issue.code === "NO_PAGES")).toBe(true);
  });

  it("invalidates review receipts after equal-length edits between old string samples", () => {
    const before = page([]);
    before.note = "a".repeat(10_000);
    const after = { ...before, note: `${before.note.slice(0, 1_000)}b${before.note.slice(1_001)}` };
    expect(computeStudioQualityRevisionKey({ pages: [before] }))
      .not.toBe(computeStudioQualityRevisionKey({ pages: [after] }));
  });
});
''')

(base / 'StudioContinuityPanel.hardening.test.tsx').write_text('''// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectStudioQuality } from "./studio-quality-inspection";
import { StudioContinuityPanel } from "./StudioContinuityPanel";

import type { PageState } from "./studio-page-state";

const raster = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock("./studio-quality-raster-inspection", () => ({ inspectStudioRasterAssets: raster.inspect }));
const emptyIssues: [] = [];
const manualIds = ["mobile", "zoom", "scroll", "color", "rights", "destination"];
function page(): PageState {
  return { id: "page", canvasH: 600, bg: "#fff", bgGrad: null,
    review: { status: "approved", locked: true },
    elements: [{ id: "frame", type: "frame", x: 10, y: 10, width: 700, height: 550 }] };
}
function manualCheckbox(): HTMLInputElement {
  return screen.getByRole("checkbox", { name: /모바일 독자 폭/u }) as HTMLInputElement;
}
function seed(key: string, pages: PageState[], extra: Record<string, unknown> = {}): void {
  const report = inspectStudioQuality({ pages });
  localStorage.setItem(`toonstudio:quality-inspection:v2:${encodeURIComponent(key)}`, JSON.stringify({
    manualRevisionKey: report.revisionKey, manualCheckIds: manualIds,
    acknowledgedIssueIds: report.issues.map((issue) => issue.id), ...extra,
  }));
}
beforeEach(() => {
  localStorage.clear();
  raster.inspect.mockReset();
  raster.inspect.mockResolvedValue({ status: "complete", issues: [], assetReferenceCount: 0,
    probedSourceCount: 0, skippedSourceCount: 0 });
});
afterEach(cleanup);

describe("quality center review ownership", () => {
  it("supports omitted pages without repeated raster effects and rescans explicitly", async () => {
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} />);
    await waitFor(() => expect(raster.inspect).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    await waitFor(() => expect(raster.inspect).toHaveBeenCalledTimes(2));
    expect(screen.getByText("검사할 페이지 없음")).not.toBeNull();
  });

  it("does not persist anonymous draft decisions", async () => {
    const pages = [page()];
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} />);
    fireEvent.click(manualCheckbox());
    expect(manualCheckbox().checked).toBe(true);
    expect(localStorage.length).toBe(0);
    view.unmount();
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} />);
    expect(manualCheckbox().checked).toBe(false);
  });

  it("does not reuse same-content receipts across document identities", async () => {
    const pages = [page()];
    seed("owner-A", pages);
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="owner-A" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    view.rerender(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="owner-B" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
  });

  it("invalidates both acknowledgements and manual checks after edits", async () => {
    const pages = [{ ...page(), review: { status: "draft" as const, locked: false } }];
    seed("revision", pages);
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="revision" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    expect(screen.queryByText("페이지 승인 대기")).toBeNull();
    const edited = [{ ...pages[0]!, note: "새 검토가 필요한 변경" }];
    view.rerender(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={edited} documentKey="revision" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.getByText("페이지 승인 대기")).not.toBeNull();
  });

  it("rejects malformed stored arrays without crashing", async () => {
    const pages = [page()];
    seed("malformed", pages, { acknowledgedIssueIds: {}, manualCheckIds: "mobile" });
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="malformed" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
  });

  it("keeps long document keys distinct", async () => {
    const pages = [page()];
    const prefix = "scope".repeat(50);
    seed(`${prefix}A`, pages);
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey={`${prefix}B`} />);
    expect(manualCheckbox().checked).toBe(false);
  });

  it("does not promote an unavailable raster scan to ready", async () => {
    const p = page();
    p.elements.push({ id: "image", type: "image", src: "/asset.png", x: 20, y: 20,
      width: 300, height: 200, rotation: 0 });
    const pages = [p];
    seed("raster-unavailable", pages);
    raster.inspect.mockResolvedValue({ status: "unavailable", issues: [], assetReferenceCount: 1,
      probedSourceCount: 0, skippedSourceCount: 0 });
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="raster-unavailable" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
    expect(screen.getByText(/이 환경에서는 이미지 원본 해상도 검사를 실행할 수 없습니다/u)).not.toBeNull();
  });
});
''')

stack_test = base / 'StudioLazyPanelStack.test.tsx'
replace(stack_test, 'import type { ReactElement } from "react";', 'import { StudioDocumentRuntimeContext } from "./studio-router/studio-document-runtime-context";\n\nimport type { ReactElement } from "react";')
replace(stack_test, '    StudioContinuityPanel: panel("continuity"),', '''    StudioContinuityPanel: ({ documentKey, onSelectTarget, onSelectScene }: {
      documentKey?: string;
      onSelectTarget: (target: { pageId: string; elementId: string }) => void;
      onSelectScene: (sceneId: string) => void;
    }) => (
      <div data-optional-panel="continuity" data-document-key={documentKey ?? "none"}>
        <button type="button" onClick={() => onSelectTarget({ pageId: "quality-page", elementId: "quality-frame" })}>품질 문제 이동</button>
        <button type="button" onClick={() => onSelectScene("quality-scene")}>연속성 문제 이동</button>
      </div>
    ),''')
with stack_test.open('a') as f:
    f.write('''

describe("quality inspection host navigation admission", () => {
  it.each([false, true])("preserves target ownership when page switch admission=%s", (admitted) => {
    const setCurrentPageId = vi.fn(() => admitted);
    const setTool = vi.fn();
    const setSelectedId = vi.fn();
    const setContinuityOpen = vi.fn();
    const props = createProps({
      continuityOpen: true,
      continuityIssues: [],
      continuityScenes: [{ id: "quality-scene", pageId: "quality-page", frameId: "quality-frame",
        label: "품질 장면", beat: { sceneId: "quality-scene" } }],
      studioComments: { version: 1, threads: [] },
      workId: null,
      title: "",
      setTool,
      setSelectedId,
      setContinuityOpen,
      stableHandlers: { ...createHandlers(), setCurrentPageId },
    });
    render(withRetainedBg3dHost(
      <StudioDocumentRuntimeContext.Provider value={{ documentKey: "auth:draft:unique", instanceId: "runtime" }}>
        <StudioLazyPanelStack {...props} />
      </StudioDocumentRuntimeContext.Provider>
    ));
    expect(screen.getByRole("button", { name: "품질 문제 이동" }).parentElement?.getAttribute("data-document-key"))
      .toBe("auth:draft:unique");
    fireEvent.click(screen.getByRole("button", { name: "품질 문제 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "연속성 문제 이동" }));
    expect(setCurrentPageId).toHaveBeenCalledTimes(2);
    expect(setCurrentPageId).toHaveBeenCalledWith("quality-page");
    expect(setTool).toHaveBeenCalledTimes(admitted ? 2 : 0);
    expect(setSelectedId).toHaveBeenCalledTimes(admitted ? 2 : 0);
    expect(setContinuityOpen).toHaveBeenCalledTimes(admitted ? 2 : 0);
    if (admitted) expect(setSelectedId).toHaveBeenCalledWith("quality-frame");
  });
});
''')
print('Patched exact quality sources and wrote regression suites.')
