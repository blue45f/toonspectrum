# Studio complete brush library — 2026-09-16

## Incident

The renderer registry contained 370 brush identities, but the production brush library, material
tabs, search, favorites, and recent history were all hard-wired to the 88-row quality portfolio.
That made safe next-generation engine lanes and procedural variants look missing even though their
renderer contracts and metadata were already registered.

## Corrected inventory contract

| Surface | Count | Contract |
| --- | ---: | --- |
| Replay registry | 370 | Resolves old documents, including quarantined identities |
| Quality-first portfolio | 88 | Audited representatives ranked at the start of every complete list |
| Complete selectable inventory | 227 | Every non-quarantined identity: 225 paint + 2 erasers |
| Advanced selectable tail | 139 | Safe engine/procedural variants after the quality-first rows |
| Replay-only quarantine | 143 | Resolvable for old documents, never shown by picker or search |

The inventory is now `quality-first`, not `quality-only`. The 88 representatives keep their stable
ordering and quality gates, while every safe registered identity is reachable from the complete
library, its material tab, exact-id search, engine-lane search, favorites, recents, and the quick
shelf when explicitly pinned.

## Performance discipline

- Procedural runtime code remains lazy; the complete library widens static metadata only.
- The grid still mounts 48 rows initially and reveals subsequent 48-row batches.
- Off-screen cards retain `content-visibility: auto` and intrinsic-size containment.
- Paint/eraser inventories, catalogue lookup maps, engine-lane lookup maps, lane ids, and lane
  preset projections are precomputed once; per-card engine metadata lookup is constant-time.
- Ordinary material/search views no longer clone the catalogue or build an id map; the map is built
  only for user-ordered favorites and recent-history views.
- The exhaustive performance matrix now evaluates the complete selectable paint inventory rather
  than wasting product-gate time on quarantined replay-only rows.

### Current local gate receipt

- Complete paint matrix: 225/225 evaluated, 0 missing, 0 planner failures, 0 timing failures,
  0 coverage failures, and 0 freeze failures.
- Determinism probes: 0 nondeterministic results; the audit reports environment-limited
  unmeasured probes separately instead of treating them as passes.
- Every evaluated planner row remained inside the configured timing budget; raw timing remains an
  execution receipt rather than a cross-device performance claim.
- Quality evidence portfolio: 88 verified representatives, including 40 texture, 31 pressure,
  21 tilt, 7 stabilization, and 29 taper evidence rows.
- Brush-domain regression suite: 280 files and 2,999 tests passed.

Timing is a regression receipt for this machine, not a universal device guarantee. The zero-failure
contracts and complete inventory coverage are the portable release gates.

## Quality benchmark contract

CLIP STUDIO PAINT 5.0 documents brush-tip materials, textures, dual-brush composition, watercolor
edges, pressure/tilt/velocity dynamics, stabilization, tapering, and related correction controls.
Those capabilities are the comparison axes, not a marketing-only brush count:

- <https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm>
- <https://help.clip-studio.com/en-us/manual_en/810_subtools/Number.htm>
- <https://help.clip-studio.com/en-us/>

ToonSpectrum's automated evidence currently gates texture fidelity, hand feel, live/committed stroke
consistency, geometry fidelity, performance, memory stability, runtime-route distinctness,
deterministic output, and picker selectability. The change in this report proves breadth and
reachability; it does not claim an independently verified absolute visual-quality win over another
product without a fixed device, stylus, canvas, brush set, blind review protocol, and recorded
comparison receipt.

## Release gates

1. Catalogue set equality: selectable ids equal the non-quarantined registry exactly.
2. Quality-first ordering: the audited 88 ids remain the complete catalogue prefix.
3. Quarantine preservation: replay lookup succeeds while every picker/search lane remains closed.
4. Engine discovery: Korean engine labels, engine ids, variants, families, and procedural runtime
   aliases are searchable.
5. Progressive UI: initial/batch limits and complete reveal remain covered by component tests.
6. Selection liveness: representative advanced brushes must materialize through the real picker.
7. Performance: all selectable paint identities stay inside planner and coverage freeze budgets.
