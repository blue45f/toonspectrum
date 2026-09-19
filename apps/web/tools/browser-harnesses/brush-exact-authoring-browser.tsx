import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";

import { verifyBrushV6ProductionQuality } from "../../../../scripts/studio-brush-v6-production-quality-browser";
import { StudioMaterialBrushControls } from "../../src/domains/creator/brush/StudioMaterialBrushControls";
import { createBrushStudioV6ExactEditorProgram } from "../../src/domains/creator/brush-lab/brush-studio-v6-authoring-document";
import { createBrushStudioV6Program } from "../../src/domains/creator/brush-lab/brush-studio-v6-engine";
import { parseBrushStudioV6Import } from "../../src/domains/creator/brush-lab/brush-studio-v6-experiments";
import { createBrushStudioV6MaterialReceipt } from "../../src/domains/creator/brush-lab/brush-studio-v6-material-receipt";
import { createBrushStudioV6ProductBrush } from "../../src/domains/creator/brush-lab/brush-studio-v6-product-bridge";
import { StudioBrushV6Workbench } from "../../src/domains/creator/brush-lab/StudioBrushV6Workbench";

const sources = ["pigment-spectral-js", "pigment-open-km-spectral", "pigment-colormix-lab"];
const tool = { strokeWidth: 33, brushOpacity: 0.42, color: "#002185" };
function source(pigment: string) {
  const base = createBrushStudioV6Program("oil-hair-mixer");
  return createBrushStudioV6MaterialReceipt({ ...base, seed: 2147483647,
    slots: { ...base.slots, pigment }, tuning: { ...base.tuning, secondaryColor: "#fcd200" } });
}
function Source() {
  const [pigment, setPigment] = useState(sources[0]!);
  const material = source(pigment);
  return <><h1>Exact brush authoring verification</h1>
    <select aria-label="검증 안료" value={pigment} onChange={(e) => setPigment(e.currentTarget.value)}>
      {sources.map((id) => <option key={id}>{id}</option>)}
    </select>
    <StudioMaterialBrushControls material={material} programSet={{ version: 1, material }} currentSnapshot={tool}
      onChange={() => undefined} /></>;
}
function Editor() {
  const { id } = useParams();
  return <StudioBrushV6Workbench scope={`brush:${id}`} />;
}
const root = document.createElement("div"); document.body.append(root);
createRoot(root).render(<BrowserRouter><Routes><Route path="/" element={<Source />} />
  <Route path="/studio/assets/brushes/:id/edit" element={<Editor />} /></Routes></BrowserRouter>);

async function verifyExactBrush(pigment: string) {
  const id = location.pathname.split("/").at(-2)!;
  const key = `toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${id}`)}`;
  const raw = localStorage.getItem(key)!;
  const restored = parseBrushStudioV6Import(raw);
  const material = source(pigment);
  const expected = createBrushStudioV6ExactEditorProgram(material, id, restored.name, tool);
  const saved = createBrushStudioV6ProductBrush(restored);
  const receipt = createBrushStudioV6MaterialReceipt(expected);
  if (JSON.stringify(saved.enginePrograms?.material) !== JSON.stringify(receipt)) throw new Error("Receipt changed");
  const target = document.createElement("div"); document.body.append(target);
  try {
    const before = await verifyBrushV6ProductionQuality(expected, target);
    const after = await verifyBrushV6ProductionQuality(restored, target);
    if (before.failures.length || after.failures.length) throw new Error(JSON.stringify({ failures: [before.failures, after.failures], beforeSvg: before.svgPixels, afterSvg: after.svgPixels, live: after.liveCommitted }));
    if (JSON.stringify(before.pixelHashes) !== JSON.stringify(after.pixelHashes)) throw new Error("Pixels changed");
    return { key, id, seed: restored.seed, pigment, savedWidth: saved.strokeWidth,
      savedOpacity: saved.brushOpacity, before: before.pixelHashes, after: after.pixelHashes,
      liveCommitted: after.liveCommitted, svgError: after.svgPixels, markCount: after.markCount };
  } finally { target.remove(); }
}
window.__verifyExactBrush = verifyExactBrush;
declare global {
  interface Window {
    __verifyExactBrush: typeof verifyExactBrush;
  }
}
