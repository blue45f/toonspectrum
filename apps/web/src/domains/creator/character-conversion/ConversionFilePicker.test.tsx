// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversionFilePicker } from "./ConversionFilePicker";

afterEach(cleanup);

describe("ConversionFilePicker", () => {
  it("keeps a real labelled file input and reports the chosen file", () => {
    const onFile = vi.fn();
    render(<ConversionFilePicker label="정면 원화" accept="image/png" fileName={undefined} hint="PNG · 최대 16MiB" onFile={onFile} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input missing");
    expect(input.accept).toBe("image/png");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("파일 선택 또는 여기로 끌어 놓기")).toBeTruthy();
    const file = new File(["x"], "front.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("accepts a dropped file and shows the selected name", () => {
    const onFile = vi.fn();
    const view = render(<ConversionFilePicker label="캐릭터 GLB" accept=".glb" fileName={undefined} hint="최대 64MiB" onFile={onFile} />);
    const zone = document.querySelector("label[for]");
    if (!zone) throw new Error("drop zone missing");
    const file = new File(["glb"], "hero.glb");
    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    view.rerender(<ConversionFilePicker label="캐릭터 GLB" accept=".glb" fileName="hero.glb" hint="최대 64MiB" onFile={onFile} />);
    expect(screen.getByText("hero.glb")).toBeTruthy();
  });
});
