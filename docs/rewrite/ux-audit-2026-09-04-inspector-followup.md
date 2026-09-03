# ToonStudio inspector UX follow-up — 2026-09-04

## Scope

This follow-up closes two remaining items from `ux-audit-2026-09-02-response.md` without changing
project content, command ids, workspace persistence, or renderer behavior.

## 1. Context-scoped image subtabs

The persisted inspector layout used to remember one global image subtab. An artist could leave an
image on Retouch or Mask, work on text or drawing, then select another image and unexpectedly land
back on that stale specialist surface.

The new policy treats the image subtab as contextual navigation:

- entering an image-capable selection starts on **Quick**;
- returning from text, drawing-tool, empty-canvas or another non-image selection starts on
  **Quick**;
- switching between `image` and `draw` selection kinds starts on **Quick**;
- moving between image layers of the same kind preserves the active specialist tab so repetitive
  retouch work stays efficient;
- merely visiting another inspector primary tab preserves the specialist subtab while the same
  image selection remains active;
- hidden image state is not rewritten while the current context cannot display image tabs.

`StudioInspectorContextRouteSync` runs the pure resolver in a layout effect, avoiding one painted
frame of the stale tab after a selection transition.

## 2. Lettering primary action

`글자 편집` previously lived below all appearance, typography, constraint, blend and image-tool
sections. For a text or speech-bubble selection, the most frequent action was therefore the last
button in the inspector.

The action now appears once, immediately below the selected-element heading:

- speech bubbles use the task-oriented label **대사 편집**;
- text and text-capable stickers use **글자 편집**;
- the control is marked `essential` for the DOM density contract;
- the old bottom duplicate was removed;
- review/edit locks still disable it through the existing selection fieldset and expose the lock
  reason in the control title.

## Regression coverage

- pure context-route policy tests;
- source boundary test proving the synchronizer is mounted exactly once;
- lettering priority test proving the edit action precedes appearance/typography and has one
  execution site;
- inspector source-scan aggregation includes the new boundary and resolver.
