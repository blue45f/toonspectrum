// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioMarketplaceSellerPanel } from "./StudioMarketplaceSellerPanel";

const DIGEST = new Uint8Array(32).fill(0xab).buffer;
const key = (seller: string) => `toonspectrum:studio-marketplace-submission:v1:${seller}`;
function deferredDigest() {
  let resolve!: (value: ArrayBuffer) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ArrayBuffer>((ok, fail) => { resolve = ok; reject = fail; });
  vi.mocked(globalThis.crypto.subtle.digest).mockReturnValueOnce(promise);
  return { resolve, reject };
}
function attach(name: string, index = 0) {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[index]!, { target: { files: [new File([name], name)] } });
}
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockResolvedValue(DIGEST) } });
});
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("seller file verification ownership", () => {
  it("does not attach the previous seller's file to the next seller", async () => {
    const pending = deferredDigest();
    const view = render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("alpha.toon-brush");
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(1));
    view.rerender(<StudioMarketplaceSellerPanel sellerId="beta" locale="ko" />);
    fireEvent.change(screen.getByLabelText("에셋 이름"), { target: { value: "Beta draft" } });
    const before = localStorage.getItem(key("beta"));
    await act(async () => pending.resolve(DIGEST));
    expect(localStorage.getItem(key("beta"))).toBe(before);
    expect(screen.queryByText(/alpha\.toon-brush/u)).toBeNull();
  });
  it("invalidates a verification even when switching back to the same seller", async () => {
    const pending = deferredDigest();
    const view = render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("stale.toon-brush");
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(1));
    view.rerender(<StudioMarketplaceSellerPanel sellerId="beta" locale="ko" />);
    view.rerender(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    const before = localStorage.getItem(key("alpha"));
    await act(async () => pending.resolve(DIGEST));
    expect(localStorage.getItem(key("alpha"))).toBe(before);
  });
  it("does not persist completed verification after unmount", async () => {
    const pending = deferredDigest();
    const view = render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("unmounted.toon-brush");
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(1));
    const before = localStorage.getItem(key("alpha"));
    view.unmount();
    await act(async () => pending.resolve(DIGEST));
    expect(localStorage.getItem(key("alpha"))).toBe(before);
  });
  it("does not show an old seller's checksum error in the new draft", async () => {
    const pending = deferredDigest();
    const view = render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("old.toon-brush");
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(1));
    view.rerender(<StudioMarketplaceSellerPanel sellerId="beta" locale="ko" />);
    await act(async () => pending.reject(new Error("old checksum failure")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(false);
  });
  it("keeps all file controls disabled until every pending hash settles", async () => {
    const product = deferredDigest();
    const preview = deferredDigest();
    render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("product.toon-brush");
    attach("preview.png", 1);
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(2));
    await act(async () => preview.resolve(DIGEST));
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect([...inputs].every((input) => input.disabled)).toBe(true);
    await act(async () => product.resolve(DIGEST));
    expect([...inputs].every((input) => !input.disabled)).toBe(true);
  });
  it("does not replace the latest selected file with a late older hash", async () => {
    const old = deferredDigest();
    const latest = deferredDigest();
    render(<StudioMarketplaceSellerPanel sellerId="alpha" locale="ko" />);
    attach("old.toon-brush");
    attach("latest.toon-brush");
    await waitFor(() => expect(crypto.subtle.digest).toHaveBeenCalledTimes(2));
    await act(async () => latest.resolve(DIGEST));
    await act(async () => old.resolve(DIGEST));
    const stored = localStorage.getItem(key("alpha"));
    expect(stored).toContain("primary/latest.toon-brush");
    expect(stored).not.toContain("primary/old.toon-brush");
  });
});
