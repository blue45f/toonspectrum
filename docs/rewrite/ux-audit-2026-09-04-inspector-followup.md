# ToonStudio inspector UX follow-up — 2026-09-04

## Scope

This follow-up closes the remaining context-routing item from the Studio UX audit without changing project content, command ids, workspace persistence, or renderer behavior. The lettering-primary-action work from the same audit is consolidated into `ux-audit-2026-09-04-followup.md` and the top-level inspector action implemented by the companion UX follow-up.

## Context-scoped image subtabs

The persisted inspector layout used to remember one global image subtab. An artist could leave an image on Retouch or Mask, work on text or drawing, then select another image and unexpectedly land back on that stale specialist surface.

The new policy treats the image subtab as contextual navigation:

- entering an image-capable selection starts on **Quick**;
- returning from text, drawing-tool, empty-canvas or another non-image selection starts on **Quick**;
- switching between `image` and `draw` selection kinds starts on **Quick**;
- moving between image layers of the same kind preserves the active specialist tab so repetitive retouch work stays efficient;
- merely visiting another inspector primary tab preserves the specialist subtab while the same image selection remains active;
- hidden image state is not rewritten while the current context cannot display image tabs.

`StudioInspectorContextRouteSync` runs the pure resolver in a layout effect, avoiding one painted frame of the stale tab after a selection transition.

## Regression coverage

- pure context-route policy tests;
- source boundary test proving the synchronizer is mounted exactly once;
- inspector source-scan aggregation includes the new boundary and resolver;
- the consolidated UX follow-up keeps the primary text and speech-bubble edit action ahead of secondary controls.
