import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleFacts {
  imports: string[];
  source: string;
}

function moduleFacts(fileName: string): ModuleFacts {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports: string[] = [];
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return { imports, source };
}

describe("studio drawing pointer transport ownership boundary", () => {
  it("keeps the imperative transport React-, Konva-, CRDT-, and document-model-free", () => {
    const transport = moduleFacts("./studio-drawing-pointer-transport.ts");

    expect(transport.imports).toEqual(["./studio-pointer-input"]);
    expect(transport.source).not.toMatch(/from\s+["'](?:react|konva|react-konva)["']/u);
    for (const domainOwner of [
      "finishDrawingPointer",
      "studioCrdtDocumentRef",
      "pendingStrokeCommitsRef",
      "scheduleDraft(",
      "beginLiveResourceEdit",
      "endLiveResourceEdit",
      "DrawEl",
    ]) {
      expect(transport.source).not.toContain(domainOwner);
    }
  });

  it("moves drawing session, capture, safety listeners, and native-end dedupe out of StudioPage", () => {
    const transport = moduleFacts("./studio-drawing-pointer-transport.ts").source;
    const page = moduleFacts("./StudioPage.tsx").source;

    expect(page).toContain('from "./studio-drawing-pointer-transport"');
    for (const formerPageOwner of [
      "drawingPointerSessionRef",
      "drawingPointerCaptureTargetRef",
      "drawingPointerSafetyCleanupRef",
      "drawingPointerGlobalEndRef",
      "drawingPointerGlobalMoveRef",
      "drawingPointerGlobalCancelRef",
      "drawingHandledNativeEndEventsRef",
      "resolveDrawingPointerCaptureTarget",
      "attachDrawingPointerSafetyListeners",
    ]) {
      expect(page).not.toContain(formerPageOwner);
    }

    for (const transportOwner of [
      "class StudioDrawingPointerTransportController",
      "resolveStudioDrawingPointerCaptureTarget",
      "handledNativeEndEvents",
      'add(windowTarget, "pointermove"',
      'add(windowTarget, "pointerup"',
      'add(windowTarget, "pointercancel"',
      'add(captureTarget as StudioDrawingPointerEventTarget, "lostpointercapture"',
      "tryCaptureStudioStrokePointer",
      "tryReleaseStudioStrokePointer",
    ]) {
      expect(transport).toContain(transportOwner);
    }
  });

  it("leaves Stage facades and the full finish/CRDT/draft/pending/lease coordinator in the Page", () => {
    const page = moduleFacts("./StudioPage.tsx").source;

    for (const pageOwner of [
      "function onStageDown",
      "function onStageMove",
      "function onStagePointerCancel",
      "function onStageUp",
      "function finishDrawingPointer",
      "crdtDocument.beginStroke(",
      "crdtDocument.appendStrokeSamples(",
      "studioCrdtDocumentRef.current?.deleteStroke(",
      "scheduleDraft(",
      "pendingStrokeCommitsRef.current",
      "beginLiveResourceEdit(",
      "endLiveResourceEdit()",
    ]) {
      expect(page).toContain(pageOwner);
    }

    expect(page).toContain("requireStudioDrawingPointerTransport(drawingPointerTransportRef).start({");
    expect(page).toContain("requireStudioDrawingPointerTransport(drawingPointerTransportRef).updatePorts({");
    expect(page).toContain(
      "requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)"
    );
    expect(page).toContain("requireStudioDrawingPointerTransport(drawingPointerTransportRef).release()");
    expect(page).toContain("requireStudioDrawingPointerTransport(drawingPointerTransportRef).dispose()");
  });
});
