# ToonStudio selection border benchmark — 2026-09-12

## Official reference behavior

- [Krita Select Menu](https://docs.krita.org/en/reference_manual/main_menu/select_menu.html): Border Selection removes a selection's interior and retains its boundary; Grow/Shrink/Smooth/Feather remain separate commands.
- [Clip Studio Paint Advanced Selection Functions](https://help.clip-studio.com/en-us/manual_en/330_selection/Advanced_Selection_Functions.htm): expansion/contraction use an explicit width and support rounded corners; feathering is a distinct operation. The current manual also documents multiple reference-layer scopes and Quick Mask, which Studio already provides.

Studio's preceding benchmark listed border selection as missing. Existing expand/contract commands move polygon vertices relative to their centroid and cannot produce a ring with holes. This change adds an integrated border command without changing those existing transforms.

## Implemented workflow

Image inspector → selection/retouch → Selection Workbench → Border Selection. Choose inside, center, or outside; enter a thickness in the image's displayed pixel units; apply once. The result replaces the current boundary through the existing selection-history `transform` operation, so selection Undo/Redo restores it. The command needs selection geometry only: transparent image content and unavailable image sources do not prevent it from running.

The canonical composed add/subtract/invert mask is rendered in the existing module worker using the existing selection mask painter. The hard mask goes through an exact separable squared Euclidean distance transform. Scaling the horizontal and vertical distances by their displayed pixel pitch gives equal apparent thickness for non-square images. Interior holes, disconnected islands, inverted selections and full-image edge borders are included. Center placement divides the requested total thickness between both sides. A full-image outside border is an empty result within the image and is undoable.

Feather is excluded from the intermediate raster and preserved once on the final canonical selection. Original image pixels are never read, modified or uploaded. The existing `PixelSelection` model, overlay, Quick Mask, local saved selections and history continue to consume the result.

## Responsiveness and correctness boundaries

- Maximum raster dimension: 640px, as used by the existing mask-to-selection tracer. The UI derives a minimum meaningful thickness from the selected image's displayed dimensions and explains that fine boundaries of large images are approximated. Maximum thickness is 128 displayed px.
- Worker requests use the existing timeout, cancellation, bounded-selection validation and lifecycle. No image RGBA buffer is allocated or transferred for the border request.
- A delayed source/border result is cancelled when the selection, operation mode, layer/source, image dimensions, flips, scope or busy/lock state changes. Unmount also aborts. Errors preserve the prior selection.
- Before tracing, a connected-component pass rejects more than 48 disconnected selected islands, 48 enclosed holes, or islands/holes below the canonical selection area threshold. The UI reports this limitation and retains the old selection instead of silently dropping those regions.
- Invalid or nonfinite image geometry disables only the border action with a reason. It does not crash the rest of the inspector.
- Mobile and coarse-pointer actions have a 44px minimum height.

## Verification

Focused tests compare 54 varied-alpha/anisotropic border masks with an independent brute-force Euclidean reference, verify holes/islands/empty/full/inverted masks, validate malformed dimensions and excessive topology, process a 640×640 mask at maximum width, and round-trip the worker result through canonical selection history.

UI interaction tests cover width/placement submission, image-source independence, one history commit, worker failure, selection/source/dimension/lock/scope cancellation, unmount, and invalid image geometry. Existing color-range worker and workbench tests remain part of the regression run.

A native Chromium 151 run imports the production worker client and exercises its module Worker and OffscreenCanvas path. Eight scenarios (inside/outside/center, a hole, inversion, full-image inside/outside, and feather) pass 28 exact pixel probes after canonical Canvas2D mask rendering. A 4px feather produces 5,288 partially transparent pixels; no browser or worker errors are observed. This verifies those bounded fixtures, rather than claiming visual equivalence with desktop applications. Release verification supplies the final TypeScript, production build, and integrated editor evidence.
