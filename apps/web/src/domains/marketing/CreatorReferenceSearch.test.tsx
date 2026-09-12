// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { CreatorReferenceSearch } from "./CreatorReferenceSearch";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
function setup(locale: "ko" | "en" = "ko") {
  return render(<MemoryRouter initialEntries={["/"]}><CreatorReferenceSearch locale={locale} /><LocationProbe /></MemoryRouter>);
}
afterEach(cleanup);

describe("reference search launch", () => {
  it("previews the server vocabulary while preserving the Korean URL", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "중세 갑옷" } });
    expect(screen.getByText("medieval armor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "자료 찾기" }));
    const destination = new URL(screen.getByTestId("location").textContent ?? "", "https://example.test");
    expect(destination.pathname).toBe("/research/assets");
    expect(destination.searchParams.get("q")).toBe("중세 갑옷");
  });
  it("does not navigate with empty input and associates its error", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "자료 찾기" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
  it("selecting an example does not trigger a search or paid request", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "한복" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("한복");
    expect(screen.getByText("Korean costume")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
  it("never removes unknown words from a partial query", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "갑옷 우주해적선" } });
    expect(screen.getByText("armor 우주해적선")).toBeTruthy();
  });
  it("provides English labels and form behavior", () => {
    setup("en");
    expect(screen.getByRole("textbox", { name: "Reference search in Korean or English" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "architecture" } });
    fireEvent.click(screen.getByRole("button", { name: "Find references" }));
    expect(screen.getByTestId("location").textContent).toBe("/research/assets?q=architecture");
  });
});
