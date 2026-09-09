# Studio selection benchmark and implementation — 2026-09-09

## Goal

Make object selection in `/studio` predictable for first-time users and powerful for large,
layered webtoon documents without regressing the existing pixel-selection, group-isolation,
or transform pipelines.

This wave deliberately treats selection as a shared product contract rather than a one-off
pointer handler. Canvas gestures, layer-list commands, keyboard navigation, accessibility
announcements, and future contextual menus can all consume the same pure engine.

## Reference products

| Product | Selection behavior worth carrying forward | Studio decision |
| --- | --- | --- |
| Figma | Parent-first selection, deep select, select-layer stack, Shift toggle, marquee, layer-range selection, inverse selection, matching layers, and Smart Selection spacing | Preserve Studio's existing group isolation; add deterministic set/range/inverse primitives, topmost-first hit stacks, and equal-gap distribution |
| Adobe Illustrator | Group Selection, nested-object isolation, additive/removal selection, and select-behind workflows | Keep group-unit expansion and expose an ordered candidate stack that can power select-behind/cycle UI |
| AutoCAD / Revit / SketchUp LayOut | Left-to-right window selection contains; right-to-left crossing selection intersects | Ship the directional policy directly in the live Studio marquee path while keeping literal/API rectangles backward compatible |
| Clip Studio Paint | New/add/subtract selection modes, reference-layer scope, Quick Mask, saved selection, and a contextual Selection Launcher | Retain the existing pixel-selection operation modes, source scope, Quick Mask, saved selections, and contextual HUD; align object-selection set algebra with the same mental model |
| Krita | Replace/add/subtract/intersect/symmetric-difference operations and persistent selection masks | Add reusable object-selection set operations, including toggle/symmetric difference; keep Studio's existing saved pixel selections |

## Official references

- Figma, **Select layers and objects**: <https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects>
- Figma, **Arrange layers with Smart selection**: <https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection>
- Adobe Illustrator, **Select object groups and nested object groups**:
  <https://helpx.adobe.com/uk/illustrator/desktop/manage-objects/select-objects/select-object-groups-and-nested-object-groups.html>
- Autodesk AutoCAD, **About selecting multiple objects**:
  <https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-531FB60D-833B-4813-927A-42275CF6777D.htm>
- Autodesk Revit, **Selection — Essential Skill**:
  <https://help.autodesk.com/cloudhelp/2026/ENU/Revit-GetStarted/files/GUID-AC1CAA25-037D-4EA1-B357-D59CE29FE754.htm>
- Clip Studio Paint, **Advanced Selection Functions**:
  <https://help.clip-studio.com/en-us/manual_en/330_selection/Advanced_Selection_Functions.htm>
- Clip Studio Paint, **Selection Launcher**:
  <https://help.clip-studio.com/en-us/manual_en/330_selection/Selection_Launcher.htm>
- Krita, **Selections**: <https://docs.krita.org/en/user_manual/selections.html>
- Krita, **Selection masks**:
  <https://docs.krita.org/en/reference_manual/layers_and_masks/selection_masks.html>

## Existing Studio strengths retained

The implementation builds on, rather than replaces, the current Studio capabilities:

- group-aware click selection and explicit group-entry/isolation;
- hidden-layer filtering and group-unit expansion at marquee commit;
- rectangle, ellipse, lasso, polygon-lasso, and brush pixel selections;
- replace/add/subtract/intersect pixel operations;
- source scopes across the current layer, selected layers, reference layers, folders, and canvas;
- Quick Mask, local opaque-pixel selection, local subject selection, feathering, and saved selections;
- multi-object alignment, center distribution, transform, and one-gesture history behavior.

## Implemented in this wave

### 1. Direction-aware object marquee

`normalizeMarqueeRect` retains drag direction as transient `WeakMap` metadata while preserving
the public `{ x, y, w, h }` shape.

- Drag left to right: **window selection**; an object's bounds must be fully contained.
- Drag right to left: **crossing selection**; touching or intersecting bounds are selected.
- Programmatic/plain rectangle calls: preserve the previous intersection behavior.

The current pointer pipeline passes the normalized rectangle object through the preview ref to
pointer-up without cloning, so this policy applies to the shipped canvas path without document
schema changes or extra render state.

### 2. Explicit hit policies

The marquee engine now supports:

- `auto`, `contain`, `intersect`, and `center` hit modes;
- configurable hit slop for touch/pen accessibility;
- minimum object-overlap ratio;
- item availability filters;
- duplicate-id suppression;
- deterministic document ordering;
- optional result caps for very large scenes.

### 3. Hardened geometry

Every selection boundary is normalized before use:

- negative width/height is accepted and normalized;
- `NaN` and infinite values collapse safely instead of poisoning selection state;
- boundary contact is treated consistently as a hit;
- shared area and overlap ratio remain mathematically separate from edge contact;
- zero-area objects can still participate through center/point containment.

### 4. Select-behind foundation

`pickObjectIdsAtPoint` returns all candidates under a point from topmost to bottommost, with
availability filtering, hit slop, duplicate suppression, and caps. `cycleSelectionCandidate`
wraps deterministically in both directions. This is the engine required for a Figma/Illustrator/
Revit-style layer chooser or Tab-cycle interaction without re-running ad hoc hit tests.

### 5. Shared selection-set algebra

`combineSelectionIds` implements `replace`, `add`, `subtract`, `intersect`, and `toggle` while:

- preserving canonical document z-order;
- removing stale ids;
- suppressing duplicates;
- keeping canvas and layer-list semantics identical.

`invertSelectionIds` and `selectIdRange` cover inverse selection and Shift-range layer selection.

### 6. Equal visual-gap distribution

Studio already distributed object centers. `computeEqualGapDeltas` adds equal horizontal or
vertical gaps for differently sized objects, complementing center distribution and matching the
spacing expectation established by Smart Selection-class tools.

## Architecture

```text
studio-selection.ts (stable facade)
  ├─ selection/studio-object-selection-geometry.ts
  ├─ selection/studio-object-selection-marquee.ts
  ├─ selection/studio-object-selection-pick.ts
  ├─ selection/studio-object-selection-set.ts
  └─ selection/studio-object-selection-layout.ts
```

The facade keeps existing imports stable. No document migration, persistence change, React state,
or Konva dependency is introduced.

## Verification contract

`selection/studio-object-selection-pro.test.ts` covers:

1. transient drag intent with an unchanged public rectangle shape;
2. negative and non-finite geometry normalization;
3. boundary contact and tolerance;
4. containment, hit slop, and overlap ratios;
5. live left-to-right window and right-to-left crossing behavior;
6. backward compatibility for plain rectangles;
7. center and minimum-overlap policies;
8. hidden/locked-style availability filters, duplicate ids, and caps;
9. topmost-first point candidates and touch hit slop;
10. all five set operations and document ordering;
11. inverse, range, and wrapped candidate cycling;
12. equal-gap distribution for mixed object sizes.

The original `studio-selection.test.ts` remains unchanged and continues to guard the public
facade's existing marquee, placement, alignment, and center-distribution contracts.
