# Vello-first / ThorVG specialist boundary — 2026-09-24

## Decision

Vello remains the preferred 2D vector renderer. Classic 0.10 and the real upstream
Vello Hybrid 0.2 are independent providers on the same StudioGpuFabric GPUDevice.
ThorVG WebCanvas 1.1.2 is added only for a bounded asset island that Vello's strict
SVG/Lottie frontends intentionally reject. No provider is a render-time fallback.

## Product routing

```text
SVG source
  -> security/resource preflight
  -> strict path/gradient/clip subset -> Vello native provider
  -> safe filter/mask/text/etc.       -> one preselected ThorVG backend
  -> active/external/over-budget      -> rejected
```

A selected provider's receipt must keep `selectedProviderId`, `attemptedProviderId`
and `activeProviderId` identical. Failure preserves a visible unavailable state and
never executes a second engine for the same request.

## Vello Hybrid scope

The browser WASM artifact is built with `hybrid,lottie,svg`. Its Hybrid entry point:

- adopts the exact existing `GPUDevice`/`GPUQueue`;
- preflights SceneIR version, dimensions and unsupported features;
- encodes fill/stroke, solid and linear/radial/sweep gradients, group opacity,
  bounded clip and the verified blend subset;
- returns an RGBA8 `GPUTexture` without CPU readback;
- rejects paragraph text and does not expose panic-prone mask/filter calls.

## ThorVG scope and safety

The ThorVG package is split into an eager audit subpath and a lazy runtime subpath.
The runtime keeps one immutable process-global backend, reference-counts live
surfaces, rejects backend conflicts and terminates only after the last surface.
SVG active content, external URLs, event handlers and unbounded nesting are rejected.
Lottie source must be self-contained, expression-free and within dimension/frame/
layer/JSON-node budgets.

Resource teardown is ordered: detach paint from canvas, dispose picture/animation,
destroy canvas, release runtime lease. This order is covered by a real Chromium
WebGPU probe with 32 complete create/render/destroy cycles and simultaneous two-
surface ownership.

## Verification gates

- Rust checks/tests for Classic, Hybrid, SVG and Lottie features.
- wasm32 check and release wasm-pack build.
- Vello/ThorVG artifact SHA-256 integrity.
- renderer-role ledger generation and lab-import quarantine.
- focused Studio/Vello/ThorVG Vitest suites and root TypeScript check.
- Chromium WebGPU lifecycle probe with zero console/page errors.
- license audit with feature-locked Cargo inventory and ThorVG MIT notice.
- application production build and Studio bundle audit.
