import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { createBrushStudioV6Program } from "../../src/domains/creator/brush-lab/brush-studio-v6-engine";
import { StudioBrushV6Workbench } from "../../src/domains/creator/brush-lab/StudioBrushV6Workbench";

import { benchmarkBrushPigments } from "./brush-pigment-benchmark";
import { benchmarkPigmentLayers } from "./brush-pigment-layer-benchmark";

const storageKey = "toonspectrum.brush-program-v6:pigment-qa";
if (!localStorage.getItem(storageKey)) {
  const base = createBrushStudioV6Program("oil-hair-mixer");
  localStorage.setItem(storageKey, JSON.stringify({ ...base, tuning: { ...base.tuning, primaryColor: "#002185", secondaryColor: "#fcd200" } }));
}
const root = document.createElement("div");
document.body.append(root);
createRoot(root).render(createElement(StudioBrushV6Workbench, { scope: "pigment-qa" }));
window.__pigmentBenchmark = benchmarkBrushPigments;
window.__pigmentLayerBenchmark = benchmarkPigmentLayers;

declare global {
  interface Window { __pigmentBenchmark: typeof benchmarkBrushPigments; __pigmentLayerBenchmark: typeof benchmarkPigmentLayers; }
}
