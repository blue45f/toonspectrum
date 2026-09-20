import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { DEFAULT_STUDIO_BRUSH_SNAPSHOT, type StudioSavedBrush } from "../../src/domains/creator/brush/studio-brush-library";
import { createMemorySessionBrushLibraryRepository } from "../../src/domains/creator/brush/studio-brush-library-sqlite-repository";
import { StudioBrushLibraryPanel } from "../../src/domains/creator/brush/StudioBrushLibraryPanel";

const repository = createMemorySessionBrushLibraryRepository();
const repositoryFactory = async () => ({ authority: "memory-session" as const, repository, migration: null });
function App() {
  const [brushes, setBrushes] = useState<StudioSavedBrush[]>([]);
  return <MemoryRouter><h1>Original source preservation</h1><StudioBrushLibraryPanel
    currentSnapshot={{ ...DEFAULT_STUDIO_BRUSH_SNAPSHOT, strokeWidth: 21 }} brushes={brushes}
    onBrushesChange={setBrushes} onApplyBrush={() => undefined} onBrushDeleted={() => undefined}
    repositoryFactory={repositoryFactory} /></MemoryRouter>;
}
const root = document.createElement("main"); document.body.append(root);
createRoot(root).render(<App />);
const qa = {
  async list() {
    const result = await repository.query({ limit: 100 });
    return result.items.map((brush) => ({ id: brush.id, name: brush.name, width: brush.strokeWidth,
      source: brush.originalSource ? { sha256: brush.originalSource.sha256,
        byteLength: brush.originalSource.byteLength, fileName: brush.originalSource.fileName } : null }));
  },
};
window.__brushOriginalSourceQa = qa;
declare global { interface Window { __brushOriginalSourceQa: typeof qa; } }
