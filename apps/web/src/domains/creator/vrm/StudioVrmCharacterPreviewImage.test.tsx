// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVrmCharacterPreviewImage } from "./StudioVrmCharacterPreviewImage";

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioVrmCharacterPreviewImage", () => {
  it("uses the real thumbnail on first paint without flashing the fallback", () => {
    render(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackSrc="fallback.svg"
        src="lumi.webp"
      />,
    );

    expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
      "lumi.webp",
    );
    expect(screen.queryByTestId("vrm-preview-pending")).toBeNull();
  });

  it("keeps the decoded frame until the replacement finishes loading", async () => {
    const { rerender } = render(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackSrc="fallback.svg"
        src="lumi-a.webp"
      />,
    );
    fireEvent.load(screen.getByTestId("vrm-preview-visible"));

    rerender(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackSrc="fallback.svg"
        src="lumi-b.webp"
      />,
    );

    expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
      "lumi-a.webp",
    );
    const pending = screen.getByTestId("vrm-preview-pending");
    expect(pending.getAttribute("src")).toBe("lumi-b.webp");
    fireEvent.load(pending);

    await waitFor(() => {
      expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
        "lumi-b.webp",
      );
    });
  });

  it("ignores a stale replacement that finishes after a newer request", async () => {
    const decoders = new Map<string, () => void>();
    const originalDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = vi.fn(function decode(
      this: HTMLImageElement,
    ) {
      return new Promise<void>((resolve) => {
        decoders.set(this.getAttribute("src") ?? "", resolve);
      });
    });

    try {
      const { rerender } = render(
        <StudioVrmCharacterPreviewImage
          alt="Lumi"
          fallbackSrc="fallback.svg"
          src="lumi-a.webp"
        />,
      );
      fireEvent.load(screen.getByTestId("vrm-preview-visible"));

      rerender(
        <StudioVrmCharacterPreviewImage
          alt="Lumi"
          fallbackSrc="fallback.svg"
          src="lumi-b.webp"
        />,
      );
      fireEvent.load(screen.getByTestId("vrm-preview-pending"));

      rerender(
        <StudioVrmCharacterPreviewImage
          alt="Lumi"
          fallbackSrc="fallback.svg"
          src="lumi-c.webp"
        />,
      );
      fireEvent.load(screen.getByTestId("vrm-preview-pending"));

      await act(async () => {
        decoders.get("lumi-b.webp")?.();
        await Promise.resolve();
      });
      expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
        "lumi-a.webp",
      );

      await act(async () => {
        decoders.get("lumi-c.webp")?.();
        await Promise.resolve();
      });
      expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
        "lumi-c.webp",
      );
    } finally {
      if (originalDecode) {
        HTMLImageElement.prototype.decode = originalDecode;
      } else {
        delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
      }
    }
  });

  it("absorbs short null hydration windows without exposing the fallback", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackDelayMs={1_200}
        fallbackSrc="fallback.svg"
        src="lumi.webp"
      />,
    );
    fireEvent.load(screen.getByTestId("vrm-preview-visible"));

    rerender(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackDelayMs={1_200}
        fallbackSrc="fallback.svg"
        src={null}
      />,
    );
    act(() => vi.advanceTimersByTime(800));
    rerender(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackDelayMs={1_200}
        fallbackSrc="fallback.svg"
        src="lumi.webp"
      />,
    );

    expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
      "lumi.webp",
    );
    expect(screen.queryByTestId("vrm-preview-pending")).toBeNull();
  });

  it("falls back only after an actual image error", () => {
    render(
      <StudioVrmCharacterPreviewImage
        alt="Lumi"
        fallbackSrc="fallback.svg"
        src="broken.webp"
      />,
    );

    fireEvent.error(screen.getByTestId("vrm-preview-visible"));
    expect(screen.getByTestId("vrm-preview-visible").getAttribute("src")).toBe(
      "fallback.svg",
    );
  });
});
