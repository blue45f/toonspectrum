import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const hostSource = readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url),
  "utf8",
);

function requiredIndex(source: string, token: string, from = 0): number {
  const index = source.indexOf(token, from);
  if (index < 0) {
    throw new Error(`Expected host token was not found: ${token}`);
  }
  return index;
}

function sourceBetween(startToken: string, endToken: string): string {
  const start = requiredIndex(hostSource, startToken);
  const end = requiredIndex(hostSource, endToken, start + startToken.length);
  return hostSource.slice(start, end);
}

describe("StudioCuttoonEditorHost Smart Shape wiring", () => {
  it("opens and confirms through the extracted session module, then mounts the shipped dialog", () => {
    expect(hostSource).toContain('from "./studio-smart-shape-host-session"');
    expect(hostSource).toContain("bindStudioSmartShapeHostControllers");
    expect(hostSource).toContain("openSmartShapeEditor");
    expect(hostSource).toContain("confirmSmartShapeEditor");
    expect(hostSource).toContain("smartShapeEditSession");
    expect(hostSource).toContain("StudioSmartShapeEditDialog");

    const bind = sourceBetween(
      "const { openSmartShapeEditor, confirmSmartShapeEditor } = bindStudioSmartShapeHostControllers({",
      "const studioMainMenuActions = useStudioStableHandlers({",
    );
    expect(bind).toContain("session: smartShapeEditSession, setSession: setSmartShapeEditSession");
    expect(bind).toContain("captureStudioMutationTicket, canApplyStudioMutation, commit");
    expect(bind).not.toContain("setQuickShapeActive");

    const handlers = sourceBetween(
      "const studioMainMenuActions = useStudioStableHandlers({",
      "activatePrimaryCanvasTool,",
    );
    expect(handlers).toContain("openSmartShapeEditor,");

    const menu = sourceBetween(
      "selectDrawMode: (mode) => {",
      "activateTransformTool:",
    );
    expect(menu).toContain("correctCurrentStroke: studioMainMenuActions.openSmartShapeEditor");
    expect(menu).toContain("setQuickShapeActive(true)");

    const dialog = sourceBetween(
      "{editorSurface}",
      "<StudioWebtoonAssistantModal",
    );
    expect(dialog).toContain("<StudioSmartShapeEditDialog");
    expect(dialog).toContain("onConfirm={confirmSmartShapeEditor}");
    expect(dialog).toContain("source={smartShapeEditSession.source}");
  });

  it("keeps the shortcut dispatcher and quick-access palette on the same open path", () => {
    const shortcuts = sourceBetween(
      "handler ??= buildStudioShortcutHandler({",
      "activateDrawToolWithProperties,",
    );
    expect(shortcuts).toContain("openSmartShapeEditor,");

    const availability = sourceBetween(
      "const quickAccessCommandAvailability: StudioQuickAccessCommandAvailability = {",
      "const quickAccessCatalog:",
    );
    expect(availability).toContain('"correct-current-stroke": !activePageMutationLocked');

    const execute = sourceBetween(
      "function executeStudioQuickAccessCommand(commandId: string): void {",
      "const mobileQuickActionsButton:",
    );
    expect(execute).toContain('intent.kind === "correct-current-stroke"');
    expect(execute).toContain("openSmartShapeEditor()");
  });
});
