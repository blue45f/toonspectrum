/** Browser-only session parity/fault checks; run by the isolated document verifier. */
export async function verifyNativeBrushSessions() {
  const base = "/apps/web/src/domains/creator/brush/";
  const { planStudioNativeBrushDocument } = await import(base + "studio-native-brush-document-contract.ts");
  const { renderStudioNativeBrushDocument } = await import(base + "studio-native-brush-document-product.ts");
  const { StudioNativeBrushDocumentSession } = await import(base + "studio-native-brush-document-session.ts");
  const stats = globalThis.__nativeDocumentWorkers;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const records = [];
  for (const engine of ["libmypaint", "canvaskit", "vello"]) {
    const plans = [8, 48, 20, 8].map((size, index) => planStudioNativeBrushDocument({
      id: "scope-" + index, type: "draw", kind: "freehand", mode: "pen", strokeWidth: size,
      stroke: ["#123456", "#dc5420", "#29842b", "#123456"][index],
      points: Array.from({ length: 48 }, (_, i) => [320 + i * 4, 360 + Math.sin(i / 7) * 24]).flat(),
      pressures: Array.from({ length: 48 }, (_, i) => 0.2 + Math.sin(i / 47 * Math.PI) * 0.6),
      tiltXs: Array(48).fill(index * 10), tiltYs: Array(48).fill(10), sampleTimeOffsets: Array.from({ length: 48 }, (_, i) => i * 8),
    }, { engine, style: ["ink", "wash", "chalk", "ink"][index], seed: [7, 99, 13, 7][index], documentWidth: 1024, documentHeight: 1024 }));
    // Obtain independent fresh-worker output before retaining the scoped engine (peak stays one).
    const baselines = [];
    for (const plan of plans) baselines.push(await renderStudioNativeBrushDocument(plan, new AbortController().signal));
    const before = stats.created;
    const session = new StudioNativeBrushDocumentSession();
    try {
      for (let index = 0; index < plans.length; index++) {
        const output = await session.render(plans[index], new AbortController().signal);
        check(output.src === baselines[index].src, `${engine}: retained state altered PNG after resize/style/seed change`);
        check(output.pngHash === baselines[index].pngHash, `${engine}: output digest changed`);
      }
      check(stats.created === before + 1, `${engine}: engine reinitialized during within-scope resize`);
      let rejected = false;
      try { await session.render({ ...plans[0], samples: [] }, new AbortController().signal); }
      catch { rejected = true; }
      check(rejected && stats.active === 0, `${engine}: failed native operation retained a Worker`);
      check(stats.created === before + 1, `${engine}: failed operation silently retried`);
      const restarted = await session.render(plans[0], new AbortController().signal);
      check(restarted.src === baselines[0].src && stats.created === before + 2, `${engine}: explicit new operation failed to restart cleanly`);
    } finally { session.dispose(); }
    check(stats.active === 0, `${engine}: disposal leaked a Worker`);
    records.push({ engine, resizedStyleSeedCases: 4, exactPngMatch: true, withinScopeInitializations: 1,
      failureEvicts: true, sameCallRetries: 0, nextExplicitOperationRecovers: true });
  }
  const single = planStudioNativeBrushDocument({ id: "idle", type: "draw", points: [100, 100, 140, 110],
    strokeWidth: 8, stroke: "#123456", pressures: [0.5, 0.8], sampleTimeOffsets: [0, 8] },
  { engine: "libmypaint", style: "ink", documentWidth: 512, documentHeight: 512 });
  const idle = new StudioNativeBrushDocumentSession({ idleMs: 30 });
  const before = stats.created;
  try {
    await idle.render(single, new AbortController().signal);
    const limit = performance.now() + 2000;
    while (stats.active !== 0 && performance.now() < limit) await new Promise((resolve) => setTimeout(resolve, 10));
    check(stats.active === 0, "Actual idle timer did not release the cached Worker");
    check(stats.created === before + 1, "Idle expiry restarted a Worker automatically");
    await idle.render(single, new AbortController().signal);
    check(stats.created === before + 2, "Next explicit conversion did not reinitialize after idle expiry");
  } finally { idle.dispose(); }
  return { records, realIdleExpiry: true, idleTestOverrideMs: 30, productIdleMs: 15000,
    zeroRemainingWorkers: stats.active === 0 };
}
