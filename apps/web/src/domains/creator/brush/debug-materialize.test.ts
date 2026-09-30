// @vitest-environment jsdom
import { expect, it } from "vitest";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";

it("materializes material-fern-frond", async () => {
  const selection = await materializeStudioBrushCatalogSelection("material-fern-frond");
  console.log("selection:", selection ? "OK" : "NULL");
  expect(selection).not.toBeNull();
}, 30000);
