from pathlib import Path

def replace(path, before, after):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == 1, (path, before, text.count(before))
    p.write_text(text.replace(before, after))

brush = 'apps/web/src/domains/creator/brush/'
replace(brush+'studio-material-tip-kernels.ts', '''        cellular(x * 6 + 10, y * 6 + 10, stableSeed, cell);
        const plate = edge(0.065 - (cell[1]! - cell[0]!), 0.045);
        return plate * (0.66 + cell[2]! * 0.34) * edge(r - 0.90, 0.05);''', '''        // A shrinking film fractures into broad lamellae, unlike the chalk's Voronoi pores.
        // Longitudinal fissures remain aligned through overlapping deposits rather than averaging
        // into another round opaque stroke. Short branch cracks stop inside each paint plate.
        const warp = y + Math.sin(x * 3.2 + phase) * 0.018;
        const fissure = Math.min(Math.abs(warp + 0.31), Math.abs(warp - 0.19));
        const film = edge(0.06 - fissure, 0.026);
        const branchX = periodicDistance((x + y * 0.32) * 2.2);
        const branches = 1 - edge(branchX - 0.025, 0.025)
          * edge(Math.abs(warp + 0.04) - 0.19, 0.04);
        const plateTone = warp < -0.31 ? 0.7 : warp > 0.19 ? 0.92 : 0.83;
        return film * branches * plateTone
          * edge(Math.max(Math.abs(x) * 0.97, Math.abs(y) * 1.12) - 0.86, 0.035);''')
replace(brush+'studio-material-brush-catalog.ts', '"name": "과슈 균열 판면"', '"name": "과슈 박막 균열"')
replace(brush+'studio-material-brush-catalog.ts', '"hint": "조밀한 불투명 판면과 가는 마른 균열을 남기는 재질 팁"', '"hint": "넓은 도막 층판과 길게 이어지는 틈 및 짧은 옆균열을 남기는 박막 질감"')

browser = 'scripts/studio-material-morphology-browser.ts'
replace(browser, '  const cases = [], planTimes: number[] = [], submitTimes: number[] = [];', '''  const cases = [], planTimes: number[] = [], submitTimes: number[] = [];
  const renderedShapes: { id: string; rgba: Uint8ClampedArray; mass: number }[] = [];''')
replace(browser, '    const replayDifference = difference(retained.rgba, replay.rgba);', '''    renderedShapes.push({ id, rgba: retained.rgba, mass: retained.mass });
    const replayDifference = difference(retained.rgba, replay.rgba);''')
replace(browser, '  const planningP95 = percentile(planTimes, 0.95), submissionP95 = percentile(submitTimes, 0.95);', '''  // Compare actual retained strokes after removing global opacity as a distinguishing feature.
  // This catches different tip masks that converge into the same dense stroke after overlap.
  let minimumStrokeDistance = Infinity;
  let closestStrokePair: string[] = [];
  let strokePairs = 0;
  for (let i = 0; i < renderedShapes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = renderedShapes[i]!, b = renderedShapes[j]!;
      let distance = 0;
      for (let p = 3; p < a.rgba.length; p += 4) {
        distance += Math.abs(a.rgba[p]! / a.mass - b.rgba[p]! / b.mass);
      }
      distance /= 2;
      strokePairs++;
      if (distance < minimumStrokeDistance) {
        minimumStrokeDistance = distance; closestStrokePair = [a.id, b.id];
      }
      invariant(distance > 0.10, `${a.id}/${b.id}: rendered shapes converge (${distance.toFixed(4)})`);
    }
  }
  invariant(strokePairs === 496, "incomplete rendered-stroke pair coverage");
  const planningP95 = percentile(planTimes, 0.95), submissionP95 = percentile(submitTimes, 0.95);''')
replace(browser, '  return { version: 1, backend: "browser-canvas2d", cases,', '''  return { version: 1, backend: "browser-canvas2d", cases,
    distinctness: { strokePairs, minimumStrokeDistance, closestStrokePair, opacityNormalized: true },''')

p = Path('docs/studio/brush-material-morphology-2026-09.md')
p.write_text(p.read_text()+'''
## Full-stroke anti-clone regression

Different tip fields can still converge when dense deposits overlap. The browser gate therefore
also compares all **496 pairs of actual retained strokes** with the same color, width and pressure
trace, normalizing each alpha image to equal total mass. Every pair must exceed 0.10 total
variation. This is independent of the 0.18 tip-field gate, and does not count opacity as novelty.
The audit exposed a chalk/gouache convergence; the gouache construction was replaced with a
separate lamellar film-fracture program, rather than changing only opacity, size or random seed.
These trace-specific numerical guards still do not replace artist testing or physical paint
simulation. The exact minimum and closest pair are retained in the browser report.
''')
print('Applied independently constructed film fracture and all 496 opacity-neutral rendered-stroke comparisons.')
