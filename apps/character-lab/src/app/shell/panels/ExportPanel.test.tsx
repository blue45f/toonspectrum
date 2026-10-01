// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDefaultRecipe } from "../../../contracts";
import { isPng } from "../../../export/png-encoder";
import { serializeRecipe } from "../../../export/recipe-file";
import { createPaintSession } from "../../../paint/paint-session";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { installPsdCanvasStub } from "../../../testing/psd-canvas-stub";

import { ExportPanel, readTextFile } from "./ExportPanel";

import type { LabCommand } from "../../../contracts";
import type { SaveBytesResult } from "../../../export/save-bytes";
import type { MockEngine } from "../../../testing/mock-engine";

interface SaveCall {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

function fakeSave(calls: SaveCall[]): (fileName: string, bytes: Uint8Array, mime: string) => SaveBytesResult {
  return (fileName, bytes, mime) => {
    calls.push({ fileName, bytes, mime });
    return { ok: true, fileName, bytes: bytes.length, url: "blob:test" };
  };
}

function readySession(engine: MockEngine) {
  const session = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
  session.setEngine(engine);
  return session;
}

beforeAll(() => {
  installPsdCanvasStub();
});

afterEach(cleanup);

describe("ExportPanel", () => {
  it("엔진이 없으면 PNG·PSD·GLB 버튼이 비활성이고 사유를 보여주며 레시피 저장은 가능하다", async () => {
    const calls: SaveCall[] = [];
    render(
      <MockLabProvider>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    expect(screen.getByRole("status").textContent).toMatch(/엔진 상태: idle/u);
    expect((screen.getByRole("button", { name: "투명 PNG 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "레이어 PSD 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "GLB 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toMatch(/\.character\.json$/u);
    expect(calls[0]?.mime).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(calls[0]?.bytes)).version).toBe(1);
    expect(screen.getByText(/저장됨: character-/u)).toBeTruthy();
  });

  it("투명 PNG는 입력한 해상도로 캡처해 PNG 바이트를 저장한다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "48" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("프레이밍"), { target: { value: "bust" } });
    fireEvent.change(screen.getByLabelText("물리 settle 스텝"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "투명 PNG 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-48x32.png");
    expect(isPng(calls[0]?.bytes ?? new Uint8Array())).toBe(true);
    const request = engine.calls.find((c) => c.method === "renderPasses")?.args[0] as { width: number; height: number; camera?: { mode: string }; settleSteps: number };
    expect(request).toMatchObject({ width: 48, height: 32, settleSteps: 5 });
    expect(request.camera?.mode).toBe("bust");
    expect(engine.calls.some((c) => c.method === "settle")).toBe(true);
    expect(screen.getByText(/저장됨: character-mock-48x32\.png/u)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PSD·GLB 저장과 저장 실패·크기 오류 표시", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine({ partIdPalette: { 1: { role: "skin", labelKo: "피부" } } });
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByLabelText(/참조 패스/u));
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-24x24.psd");
    expect(String.fromCharCode(...(calls[0]?.bytes.subarray(0, 4) ?? []))).toBe("8BPS");
    expect(screen.getByText(/레이어 \d+\(그룹 \d+\)/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "GLB 저장" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.mime).toBe("model/gltf-binary");

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export-size/u));
    expect(calls).toHaveLength(2);
  });

  it("PSD 캔버스 팩토리 등록이 실패하면 export-psd-canvas 사유를 보여주고 캡처하지 않는다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel
          session={createPaintSession({ layerSize: 8 })}
          deps={{
            save: fakeSave(calls),
            now: () => 1,
            preparePsd: () => {
              throw new Error("no canvas");
            },
          }}
        />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export-psd-canvas/u));
    expect(calls).toHaveLength(0);
    expect(engine.calls.some((c) => c.method === "renderPasses")).toBe(false);
  });

  it("레시피 불러오기는 recipe/load를 dispatch하고 페인트 레이어를 복원하며 손상 파일은 사유를 보여준다", async () => {
    const dispatched: LabCommand[] = [];
    const engine = createMockEngine();
    const paintSession = createPaintSession({ layerSize: 8 });
    const recipe = { ...createDefaultRecipe(), colors: { ...createDefaultRecipe().colors, skin: "#123456" } };
    const painted = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    painted.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    painted.endStroke();
    const { embedPaintLayers } = await import("../../../export/recipe-file");
    const text = serializeRecipe(await embedPaintLayers(recipe, painted.layersForExport()));
    render(
      <MockLabProvider engineSession={readySession(engine)} dispatchSpy={(command) => dispatched.push(command)}>
        <ExportPanel session={paintSession} deps={{ save: fakeSave([]), now: () => 1, readFile: async (file) => (file.name === "bad.json" ? "{ broken" : text) }} />
      </MockLabProvider>,
    );
    const input = screen.getByLabelText("레시피 불러오기") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([text], "ok.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(1));
    expect(dispatched[0]?.type).toBe("recipe/load");
    expect(dispatched[0]?.type === "recipe/load" && dispatched[0].recipe.colors.skin).toBe("#123456");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(engine.paintUploads).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["{ broken"], "bad.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/recipe-json-syntax/u));
    expect(dispatched).toHaveLength(1);
  });

  it("readTextFile은 File 내용을 읽는다", async () => {
    const file = new File(["안녕"], "hello.txt", { type: "text/plain" });
    expect(await readTextFile(file)).toBe("안녕");
  });
});
