import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { StudioHomeEntryRoute } from "./StudioHomeEntryRoute";

describe("the exact Studio home entry", () => {
  it.each(["", "?view=archived", "?view=trash", "?utm_source=campaign"])("retains the lightweight library for %s", (search) => {
    const markup = renderToStaticMarkup(<MemoryRouter initialEntries={[`/studio${search}`]}><StudioHomeEntryRoute home={<b>library</b>} legacy={<b>resolver</b>} /></MemoryRouter>);
    expect(markup).toContain("library");
    expect(markup).not.toContain("resolver");
  });
  it.each(["?id=opaque%20id", "?remix=source", "?mode=upload", "?id=", "?id=a&remix=b", "?mode=upload&mode=upload"])("sends identity-bearing input unchanged to the canonical resolver: %s", (search) => {
    const markup = renderToStaticMarkup(<MemoryRouter initialEntries={[`/studio${search}`]}><StudioHomeEntryRoute home={<b>library</b>} legacy={<b>resolver</b>} /></MemoryRouter>);
    expect(markup).toContain("resolver");
    expect(markup).not.toContain("library");
  });
  it("wires the discriminator to the actual exact home route", () => {
    const routes = readFileSync("apps/web/src/app/routes/groups/creator.routes.tsx", "utf8");
    expect(routes).toMatch(/id: "creator-studio-home"[^\n]+<StudioHomeEntryRoute home=\{<StudioHomePage \/>\} legacy=\{<StudioRouter \/>\}/);
  });
});
