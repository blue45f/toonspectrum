import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchStudioCanvasFileDrop,
  planStudioCanvasFileDrop,
  runStudioCanvasDropImport,
  studioCanvasDropImportBusyMessage,
  studioCanvasDropImportStartFailure,
  studioCanvasDropProjectBackupGuide,
  studioCanvasDropUnsupportedMessage,
  studioTransferMayCarryCanvasDocument,
  type StudioCanvasDropImportContext,
  type StudioCanvasDropImportHandlers,
} from "./studio-canvas-drop-import";

const file = (name: string) => ({ name });

describe("planStudioCanvasFileDrop", () => {
  it("PSD·ORA·CBZ·WILL·브러시 팩을 알맞은 가져오기 흐름으로 보낸다(대소문자 무시)", () => {
    expect(planStudioCanvasFileDrop([file("cover.PSD")])).toMatchObject({ kind: "import", target: "psd" });
    expect(planStudioCanvasFileDrop([file("layers.ora")])).toMatchObject({ kind: "import", target: "interchange" });
    expect(planStudioCanvasFileDrop([file("episode.CBZ")])).toMatchObject({ kind: "import", target: "interchange" });
    expect(planStudioCanvasFileDrop([file("ink.will")])).toMatchObject({ kind: "import", target: "interchange" });
    for (const name of ["a.abr", "b.myb", "c.kpp", "d.sut", "e.sutg", "f.bundle"]) {
      expect(planStudioCanvasFileDrop([file(name)])).toMatchObject({ kind: "import", target: "brush-pack" });
    }
  });

  it("받은 File 객체를 그대로 돌려준다", () => {
    const psd = new File(["x"], "cover.psd");
    const plan = planStudioCanvasFileDrop([psd]);
    expect(plan.kind).toBe("import");
    if (plan.kind === "import") expect(plan.file).toBe(psd);
  });

  it("이미지와 섞여 있어도 작업 파일을 우선하고 첫 번째 작업 파일 하나만 고른다", () => {
    const plan = planStudioCanvasFileDrop([file("photo.png"), file("a.psd"), file("b.cbz")]);
    expect(plan).toMatchObject({ kind: "import", target: "psd" });
    if (plan.kind === "import") expect(plan.file.name).toBe("a.psd");
  });

  it("프로젝트 백업은 끌어 놓아 열지 않고 어디서 여는지만 알려 준다", () => {
    for (const name of ["backup.json", "work.toonstudio", "work.toonproject.zip", "archive.zip"]) {
      expect(planStudioCanvasFileDrop([file(name)])).toEqual({
        kind: "guide",
        message: studioCanvasDropProjectBackupGuide(),
      });
    }
    // 작업 파일이 함께 있으면 그쪽이 먼저다(백업 안내보다 가져오기).
    expect(planStudioCanvasFileDrop([file("backup.json"), file("a.psd")])).toMatchObject({ kind: "import", target: "psd" });
  });

  it("이미지·알 수 없는 형식은 기존 이미지 드롭 경로에 맡긴다", () => {
    expect(planStudioCanvasFileDrop([file("photo.png")])).toEqual({ kind: "none" });
    expect(planStudioCanvasFileDrop([file("notes.txt")])).toEqual({ kind: "none" });
    expect(planStudioCanvasFileDrop([file("psd-notes.txt")])).toEqual({ kind: "none" });
    expect(planStudioCanvasFileDrop([])).toEqual({ kind: "none" });
  });

  it("확장자가 이름 중간에 있는 파일은 작업 파일로 보지 않는다", () => {
    expect(planStudioCanvasFileDrop([file("my.psd.png")])).toEqual({ kind: "none" });
    expect(planStudioCanvasFileDrop([file("story.cbz.txt")])).toEqual({ kind: "none" });
  });
});

describe("studioTransferMayCarryCanvasDocument", () => {
  it("끄는 중에는 형식만 보이므로 zip 계열·PSD·옥텟 스트림 파일을 작업 파일 후보로 본다", () => {
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "application/zip" }])).toBe(true);
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "application/vnd.comicbook+zip" }])).toBe(true);
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "image/vnd.adobe.photoshop" }])).toBe(true);
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "Application/Octet-Stream" }])).toBe(true);
  });

  it("이미지·텍스트·파일이 아닌 항목은 후보가 아니다", () => {
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "image/png" }])).toBe(false);
    expect(studioTransferMayCarryCanvasDocument([{ kind: "string", type: "application/zip" }])).toBe(false);
    expect(studioTransferMayCarryCanvasDocument([{ kind: "file", type: "" }])).toBe(false);
    expect(studioTransferMayCarryCanvasDocument([])).toBe(false);
    expect(studioTransferMayCarryCanvasDocument(null)).toBe(false);
    expect(studioTransferMayCarryCanvasDocument(undefined)).toBe(false);
  });
});

describe("runStudioCanvasDropImport", () => {
  type Handler = (event: ChangeEvent<HTMLInputElement>) => unknown;
  const psdFile = new File(["x"], "cover.psd");

  function setup(overrides: Partial<StudioCanvasDropImportContext> = {}, handlerResult: unknown = undefined) {
    const handlers = {
      psd: vi.fn<Handler>(() => handlerResult),
      interchange: vi.fn<Handler>(() => handlerResult),
      brushPack: vi.fn<Handler>(() => handlerResult),
    } satisfies StudioCanvasDropImportHandlers;
    const setError = vi.fn<(message: string | null) => void>();
    const context: StudioCanvasDropImportContext = {
      documentLocked: false,
      lockMessage: () => "공동 편집 잠금",
      documentImportBusy: false,
      brushPackBusy: false,
      setError,
      ...overrides,
    };
    return { handlers, setError, context };
  }

  it("대상에 맞는 핸들러에 입력창 변경 이벤트 모양으로 파일을 넘기고 이전 오류를 지운다", () => {
    for (const [target, key] of [["psd", "psd"], ["interchange", "interchange"], ["brush-pack", "brushPack"]] as const) {
      const { handlers, setError, context } = setup();
      runStudioCanvasDropImport({ kind: "import", target, file: psdFile }, handlers, context);
      expect(handlers[key]).toHaveBeenCalledTimes(1);
      const event = handlers[key].mock.calls[0]?.[0];
      expect(event?.target.files?.[0]).toBe(psdFile);
      expect(event?.target.value).toBe("");
      expect(setError).toHaveBeenLastCalledWith(null);
      for (const other of ["psd", "interchange", "brushPack"] as const) {
        if (other !== key) expect(handlers[other]).not.toHaveBeenCalled();
      }
    }
  });

  it("공동 편집 잠금이면 문서 가져오기를 막고 이유를 알리지만 브러시 팩은 막지 않는다", () => {
    const locked = setup({ documentLocked: true });
    runStudioCanvasDropImport({ kind: "import", target: "psd", file: psdFile }, locked.handlers, locked.context);
    expect(locked.handlers.psd).not.toHaveBeenCalled();
    expect(locked.setError).toHaveBeenCalledWith("공동 편집 잠금");

    const brush = setup({ documentLocked: true });
    runStudioCanvasDropImport({ kind: "import", target: "brush-pack", file: new File(["x"], "a.myb") }, brush.handlers, brush.context);
    expect(brush.handlers.brushPack).toHaveBeenCalledTimes(1);
  });

  it("이미 진행 중인 가져오기가 있으면 조용히 무시하지 않고 안내한다", () => {
    const busy = setup({ documentImportBusy: true });
    runStudioCanvasDropImport({ kind: "import", target: "interchange", file: new File(["x"], "a.cbz") }, busy.handlers, busy.context);
    expect(busy.handlers.interchange).not.toHaveBeenCalled();
    expect(busy.setError).toHaveBeenCalledWith(studioCanvasDropImportBusyMessage());

    const brushBusy = setup({ brushPackBusy: true });
    runStudioCanvasDropImport({ kind: "import", target: "brush-pack", file: new File(["x"], "a.kpp") }, brushBusy.handlers, brushBusy.context);
    expect(brushBusy.handlers.brushPack).not.toHaveBeenCalled();
    expect(brushBusy.setError).toHaveBeenCalledWith(studioCanvasDropImportBusyMessage());

    // 문서 가져오기가 진행 중이어도 브러시 팩은 별개 흐름이다.
    const mixed = setup({ documentImportBusy: true });
    runStudioCanvasDropImport({ kind: "import", target: "brush-pack", file: new File(["x"], "a.kpp") }, mixed.handlers, mixed.context);
    expect(mixed.handlers.brushPack).toHaveBeenCalledTimes(1);
  });

  it("핸들러가 거절하거나 던지면 오류 줄로 알린다", async () => {
    const rejected = setup({}, Promise.reject(new Error("PSD를 읽지 못했어요.")));
    runStudioCanvasDropImport({ kind: "import", target: "psd", file: psdFile }, rejected.handlers, rejected.context);
    await Promise.resolve();
    await Promise.resolve();
    expect(rejected.setError).toHaveBeenLastCalledWith("PSD를 읽지 못했어요.");

    const thrown = setup();
    thrown.handlers.psd.mockImplementation(() => {
      throw new Error("");
    });
    runStudioCanvasDropImport({ kind: "import", target: "psd", file: psdFile }, thrown.handlers, thrown.context);
    expect(thrown.setError).toHaveBeenLastCalledWith(studioCanvasDropImportStartFailure());
  });
});

describe("dispatchStudioCanvasFileDrop", () => {
  it("작업 파일은 가져오기로, 프로젝트 백업은 안내로 처리하고 true 를 돌려준다", () => {
    const importDocument = vi.fn();
    const setError = vi.fn();
    const psd = new File(["x"], "cover.psd");

    expect(dispatchStudioCanvasFileDrop([psd], importDocument, setError)).toBe(true);
    expect(importDocument).toHaveBeenCalledWith({ kind: "import", target: "psd", file: psd });
    expect(setError).not.toHaveBeenCalled();

    expect(dispatchStudioCanvasFileDrop([new File(["x"], "backup.json")], importDocument, setError)).toBe(true);
    expect(importDocument).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(studioCanvasDropProjectBackupGuide());
  });

  it("이미지·알 수 없는 형식은 false 를 돌려 기존 이미지 드롭 경로에 맡긴다", () => {
    const importDocument = vi.fn();
    const setError = vi.fn();
    expect(dispatchStudioCanvasFileDrop([new File(["x"], "photo.png")], importDocument, setError)).toBe(false);
    expect(importDocument).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });
});

describe("사용자 문구", () => {
  it("모든 안내 문구가 비어 있지 않고 서로 다르다", () => {
    const messages = [
      studioCanvasDropProjectBackupGuide(),
      studioCanvasDropUnsupportedMessage(),
      studioCanvasDropImportBusyMessage(),
      studioCanvasDropImportStartFailure(),
    ];
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(messages.length);
    // 받을 수 없는 파일 안내는 놓을 수 있는 종류를 구체적으로 알려 준다.
    expect(studioCanvasDropUnsupportedMessage()).toContain("PSD");
  });
});
