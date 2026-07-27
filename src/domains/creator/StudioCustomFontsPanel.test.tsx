// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCustomFont,
  MAX_CUSTOM_FONT_FILE_BYTES,
  MAX_CUSTOM_FONT_TOTAL_BYTES,
  type StudioCustomFont,
  type StudioFontFaceLike,
  type StudioFontSetLike,
} from "./studio-custom-fonts";
import { StudioCustomFontsPanel } from "./StudioCustomFontsPanel";

import { useI18n } from "@/lib/i18n";

type FakeFontFaceFactory = (family: string, source: string) => StudioFontFaceLike;

function fontBytes(signature: readonly number[], size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(signature.slice(0, size), 0);
  return bytes;
}

const TTF_SIGNATURE = [0x00, 0x01, 0x00, 0x00] as const;

function fontFile(name: string, bytes: Uint8Array, size?: number): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name, { type: "font/ttf" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn(async () => buffer.slice(0)),
  });
  if (size !== undefined) Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function storedFont(fileName: string, bytes = fontBytes([...TTF_SIGNATURE]), id?: string): StudioCustomFont {
  const result = addCustomFont([], { fileName, bytes, ...(id ? { id } : {}) });
  if (result.status !== "added") throw new Error(result.message);
  return result.font;
}

function fakeFontSet() {
  const faces: StudioFontFaceLike[] = [];
  const set: StudioFontSetLike = {
    add: (face) => {
      faces.push(face);
      return set;
    },
  };
  return { set, faces };
}

function okFactory(): FakeFontFaceFactory {
  return (family) => ({ family, load: () => Promise.resolve({ family }) });
}

function failingFactory(): FakeFontFaceFactory {
  return (family) => ({ family, load: () => Promise.reject(new Error("NetworkError")) });
}

function renderPanel(overrides: Partial<Parameters<typeof StudioCustomFontsPanel>[0]> = {}) {
  const onFontsChange = vi.fn();
  const onApplyFont = vi.fn();
  const { set, faces } = fakeFontSet();
  const result = render(
    <StudioCustomFontsPanel
      fonts={[]}
      onFontsChange={onFontsChange}
      onApplyFont={onApplyFont}
      canApplyFont
      fontSet={set}
      createFontFace={okFactory()}
      {...overrides}
    />
  );
  return { ...result, onFontsChange, onApplyFont, faces };
}

function importInput(): HTMLInputElement {
  return screen.getByLabelText("글꼴 파일 가져오기") as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

describe("StudioCustomFontsPanel", () => {
  it("renders the empty state and the budget readout", () => {
    renderPanel();

    expect(screen.getByText("아직 담은 글꼴이 없어요")).toBeTruthy();
    expect(screen.getByText(/0 B \/ 3 MB 사용/u)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "글꼴 보관함 사용량" }).getAttribute("aria-valuenow")).toBe("0");
  });

  it("declares a font-only accept string on the file input", () => {
    renderPanel();
    const accept = importInput().getAttribute("accept") ?? "";

    for (const extension of [".ttf", ".otf", ".ttc", ".woff", ".woff2"]) {
      expect(accept).toContain(extension);
    }
    expect(accept).not.toContain(".png");
  });

  it("imports a valid font, registers it and reports the new list upward", async () => {
    const { onFontsChange, faces } = renderPanel();

    fireEvent.change(importInput(), {
      target: { files: [fontFile("나눔손글씨.ttf", fontBytes([...TTF_SIGNATURE]))] },
    });

    await waitFor(() => expect(onFontsChange).toHaveBeenCalledTimes(1));
    const next = onFontsChange.mock.calls[0]?.[0] as StudioCustomFont[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ family: "나눔손글씨", fileName: "나눔손글씨.ttf" });
    expect(faces.map((face) => face.family)).toEqual(["나눔손글씨"]);
    expect(await screen.findByText(/“나눔손글씨” 글꼴을 담았어요/u)).toBeTruthy();
  });

  it("rejects a non-font file with an honest Korean alert and no list change", async () => {
    const { onFontsChange, faces } = renderPanel();

    fireEvent.change(importInput(), {
      target: { files: [fontFile("cat.png", fontBytes([0x89, 0x50, 0x4e, 0x47]))] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("글꼴 파일이 아니에요");
    expect(onFontsChange).not.toHaveBeenCalled();
    expect(faces).toHaveLength(0);
  });

  it("rejects an oversized file before reading its bytes", async () => {
    const { onFontsChange } = renderPanel();
    const file = fontFile("huge.ttf", fontBytes([...TTF_SIGNATURE]), MAX_CUSTOM_FONT_FILE_BYTES + 1);

    fireEvent.change(importInput(), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("2 MB");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(onFontsChange).not.toHaveBeenCalled();
  });

  it("does not keep a font whose FontFace registration failed", async () => {
    const { onFontsChange } = renderPanel({ createFontFace: failingFactory() });

    fireEvent.change(importInput(), {
      target: { files: [fontFile("Broken.ttf", fontBytes([...TTF_SIGNATURE]))] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("등록하지 못했어요");
    expect(onFontsChange).not.toHaveBeenCalled();
  });

  it("still stores the font when the browser has no FontFace support", async () => {
    const { onFontsChange } = renderPanel({ createFontFace: null, fontSet: null });

    fireEvent.change(importInput(), {
      target: { files: [fontFile("Sans.ttf", fontBytes([...TTF_SIGNATURE]))] },
    });

    await waitFor(() => expect(onFontsChange).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/미리보기를 지원하지 않아요/u)).toBeTruthy();
  });

  it("lists stored fonts with their size and reports the used budget", () => {
    const fonts = [storedFont("A.ttf", fontBytes([...TTF_SIGNATURE], 1_500), "id-a")];
    renderPanel({ fonts });

    expect(screen.getByText(/A\.ttf · 1\.5 KB/u)).toBeTruthy();
    expect(screen.getByText(/1\.5 KB \/ 3 MB 사용/u)).toBeTruthy();
    expect(screen.getByLabelText("담은 글꼴 1개")).toBeTruthy();
  });

  it("applies a font through the callback with the shared CSS value shape", () => {
    const fonts = [storedFont("Sans.ttf", fontBytes([...TTF_SIGNATURE]), "id-a")];
    const { onApplyFont } = renderPanel({ fonts });

    fireEvent.click(screen.getByRole("button", { name: "Sans 글꼴 적용" }));

    expect(onApplyFont).toHaveBeenCalledWith("'Sans', sans-serif");
  });

  it("disables apply when nothing selectable is selected", () => {
    const fonts = [storedFont("Sans.ttf", fontBytes([...TTF_SIGNATURE]), "id-a")];
    renderPanel({ fonts, canApplyFont: false });

    expect((screen.getByRole("button", { name: "Sans 글꼴 적용" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes through the callback without mutating the incoming array", () => {
    const fonts = [
      storedFont("A.ttf", fontBytes([...TTF_SIGNATURE]), "id-a"),
      storedFont("B.ttf", fontBytes([...TTF_SIGNATURE]), "id-b"),
    ];
    const { onFontsChange } = renderPanel({ fonts });

    fireEvent.click(screen.getByRole("button", { name: "A 글꼴 삭제" }));

    expect(onFontsChange).toHaveBeenCalledTimes(1);
    expect((onFontsChange.mock.calls[0]?.[0] as StudioCustomFont[]).map((font) => font.id)).toEqual(["id-b"]);
    expect(fonts).toHaveLength(2);
  });

  it("shows the budget ceiling in the readout regardless of the stored total", () => {
    renderPanel({ fonts: [storedFont("A.ttf", fontBytes([...TTF_SIGNATURE], 300_000), "id-a")] });

    const bar = screen.getByRole("progressbar", { name: "글꼴 보관함 사용량" });
    expect(bar.getAttribute("aria-valuenow")).toBe(
      String(Math.round((300_000 / MAX_CUSTOM_FONT_TOTAL_BYTES) * 100))
    );
  });
});
