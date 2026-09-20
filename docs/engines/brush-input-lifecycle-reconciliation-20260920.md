# Brush input lifecycle reconciliation

Completes the inactive shared-input work without editing its source worktree. The workbench and manuscript material renderer use one pressure/tilt/twist mapping and the same raw contact/release pressure helpers. Device values are not calibrated a second time.

An active test-pad stroke pins its program and transport. Only one primary, left-button writer owns capture and a pre-stroke bitmap. Pointer release adds a changed endpoint with the last pen contact pressure; an unchanged endpoint is not deposited twice. Cancellation, lost capture and disposal restore the pre-stroke surface. Clear releases capture and deliberately replaces the surface. Retirement removes ownership before releasing capture, so reentrant lost-capture events cannot undo a completed stroke.

The pre-stroke bitmap is limited to one live canvas copy and released on retirement. This is not native MyPaint/Krita rendering equivalence or a full-device latency benchmark. The original inactive worktree is preserved until the resulting PR is merged, and its recoverable patch/new-file snapshot is retained outside the repository.

Reproduce with the live-input lifecycle, v6 preview, velocity-pressure and material-runtime Vitest suites. The lifecycle suite covers transport pinning, release endpoints, cancellation, one writer, clear/dispose, failed capture and reentrant capture loss.
