import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPage = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("StudioPage brush quick slots SQLite product boundary", () => {
  it("removes localStorage v1/v2 from the live product call path", () => {
    expect(studioPage).not.toContain("loadStudioBrushSlotsState");
    expect(studioPage).not.toContain("saveStudioBrushSlotsState");
    expect(studioPage).not.toContain("toonspectrum-studio-brush-slots:v1");
    expect(studioPage).not.toContain("toonspectrum-studio-brush-slots:v2");
    expect(studioPage).toContain("state: emptyStudioBrushSlots()");
  });

  it("loads the product singleton behind the lazy SQLite module boundary", () => {
    expect(studioPage).toMatch(
      /import\(\s*"\.\/studio-brush-slots-sqlite-repository"\s*\)/u,
    );
    expect(studioPage).toContain("getProductStudioBrushQuickSlotsSqliteRepository().load(");
    expect(studioPage).toContain("repository.save(");
    expect(studioPage).not.toContain(
      'from "./studio-brush-slots-sqlite-repository";',
    );
  });

  it("uses a stable owner and bounded deterministic browser/device profile", () => {
    expect(studioPage).toContain('const brushSlotsOwnerScope = studioAuthUserId ?? "guest";');
    expect(studioPage).toContain(
      "const [brushSlotsDeviceProfile] = useState(studioBrushQuickSlotsDeviceProfile);",
    );
    expect(studioPage).toContain(".slice(0, 80).join(\"\") || \"unknown\"");
    expect(studioPage).toContain("browser-v1:${browserFamily}:${platform}:touch-");
    expect(studioPage).not.toContain("crypto.randomUUID()}:touch-");
  });

  it("fences late hydration behind both scope and local mutation generations", () => {
    const hydration = studioPage.indexOf("brushSlotsHydrationGenerationRef.current !== generation");
    const mutation = studioPage.indexOf(
      "brushSlotsMutationGenerationRef.current !== mutationGeneration",
      hydration,
    );
    const scope = studioPage.indexOf(
      "brushSlotsScopeRef.current.key !== request.key",
      mutation,
    );
    const projectionCommit = studioPage.indexOf(
      "setBrushSlotsProjection(projection);",
      scope,
    );
    expect(hydration).toBeGreaterThan(0);
    expect(mutation).toBeGreaterThan(hydration);
    expect(scope).toBeGreaterThan(mutation);
    expect(projectionCommit).toBeGreaterThan(scope);
  });

  it("serializes mutations, preserves dirty slots, and carries the SQLite revision", () => {
    expect(studioPage).toContain(
      "const operation = brushSlotsMutationTailRef.current.then(persist, persist);",
    );
    expect(studioPage).toContain("brushSlotsDirtyGenerationsByScopeRef");
    expect(studioPage).toContain("applyDirtySlots(durable, activeDirtySlots)");
    expect(studioPage).toContain("durable.revision");
    expect(studioPage).toContain("dirtyGenerations[slotIndex] === marker");
  });

  it("reloads and retries once on revision conflict without overwriting unrelated slots", () => {
    const conflict = studioPage.indexOf('cause.code !== "conflict"');
    const reload = studioPage.indexOf("await repository.load(request.scope)", conflict);
    const filter = studioPage.indexOf("const retryDirtySlots = activeDirtySlots.filter(", reload);
    const retry = studioPage.indexOf("applyDirtySlots(latest, retryDirtySlots)", filter);
    expect(conflict).toBeGreaterThan(0);
    expect(reload).toBeGreaterThan(conflict);
    expect(filter).toBeGreaterThan(reload);
    expect(retry).toBeGreaterThan(filter);
    expect(studioPage).toContain(
      "다른 탭의 브러시 슬롯 변경을 다시 불러와 안전하게 병합했어요.",
    );
  });

  it("announces assignment success only from the verified persistence path", () => {
    const persistenceFunction = studioPage.slice(
      studioPage.indexOf("function commitStudioBrushSlotsMutation("),
      studioPage.indexOf("/** Procreate size/opacity lock"),
    );
    expect(persistenceFunction).toContain("saved = await repository.save(");
    expect(persistenceFunction).toContain("announceDrawingShortcut(options.successMessage)");
    expect(persistenceFunction.indexOf("saved = await repository.save("))
      .toBeLessThan(persistenceFunction.lastIndexOf(
        "announceDrawingShortcut(options.successMessage)",
      ));
    expect(studioPage).toContain(
      "현재 슬롯은 이 화면에만 유지되며 저장 완료로 처리하지 않았어요.",
    );
  });

  it("soft-degrades multi-tab OPFS ownership without dumping Worker lock text to setError", () => {
    expect(studioPage).toContain("isStudioLocalDatabaseOwnershipBusyError(cause)");
    expect(studioPage).toContain("STUDIO_BRUSH_QUICK_SLOTS_OWNERSHIP_BUSY_HINT");
    expect(studioPage).toContain("brushSlotsOwnershipBusyAnnouncedRef");
    const hydrateCatch = studioPage.slice(
      studioPage.indexOf(".catch((cause) => {", studioPage.indexOf("getProductStudioBrushQuickSlotsSqliteRepository().load(")),
      studioPage.indexOf("function commitStudioBrushSlotsMutation("),
    );
    expect(hydrateCatch).toContain("isStudioLocalDatabaseOwnershipBusyError(cause)");
    expect(hydrateCatch).toContain(
      "announceDrawingShortcutRef.current(STUDIO_BRUSH_QUICK_SLOTS_OWNERSHIP_BUSY_HINT)",
    );
    // Ownership busy must return before the generic setError that embeds cause.message.
    const ownershipGuard = hydrateCatch.indexOf("isStudioLocalDatabaseOwnershipBusyError(cause)");
    const hardError = hydrateCatch.indexOf("브러시 퀵 슬롯을 불러오지 못했어요:");
    expect(ownershipGuard).toBeGreaterThan(0);
    expect(hardError).toBeGreaterThan(ownershipGuard);
  });
});
