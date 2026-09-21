# Drawing UX v4: precision color input and reusable toolbar profiles

Status: implemented. Exact-head checks and merge status are recorded in the pull request. Based on main after #1931, preserving the parser isolation introduced by #1930.

## Reproduced issues and changes

- Clearing an RGB numeric input previously sent Number("") = 0, changed the color and replaced the blank. A local numeric draft now preserves blank/decimal text and previews only finite values. Enter normalizes input, Escape cancels that field edit, and blur restores a valid displayed number.
- Numeric composition is held until completion. External changes invalidate a previous field draft, so cancelling cannot restore an older external value.
- HSV and CIELAB now have exact numeric inputs instead of read-only values. HSV keeps selected hue/saturation through black or gray RGB echoes. CIELAB retains authored channels while the existing RGB conversion still defines saved output.
- RGB/HSV/HSL/CMYK/CIELAB numeric and range controls have 44px touch targets without inflating the painted gradient track. Color-space keyboard handling does not consume composition keys.
- Creating and renaming toolbar profiles share normalized-name validation. A duplicate cannot consume another of the existing 12 slots. Imported historical names are not rewritten.
- A saved profile can be updated with the current tool order/view after explicit confirmation. The ID is preserved. Changes remain in the settings draft until the outer Apply action.
- Active-profile state reflects the actual saved order and view. Editing the layout clears a stale active-profile association.

- The tool menu now observes its own size. Delayed catalog loading and search filtering no longer leave the menu outside the viewport. Observer cleanup and the real click path are tested.

## Verification boundaries

The pre-fix RGB regression reproduced the blank-to-zero defect. Tests cover existing color spaces, local edits, composition, external updates, profile update/cancel, duplicate creation and active state.

The existing isolated browser verifier adds profile update/reload, duplicate rejection, RGB clearing/retyping, numeric Enter, HSV hue retention through black, signed CIELAB input and precision touch targets at 320/360/390px. It uses the actual SQLite/OPFS preference path; page errors and per-engine results are recorded in its generated report.

No document history authority, renderer, persistence backend, API, DB schema, deployment, branch protection or CI threshold is changed. CIELAB/RGB conversion is not an ICC soft-proof guarantee; device CMYK keeps its approximation notice. Physical pen/IME/mobile-keyboard certification and the earlier WebKit OPFS limitation remain separate from browser emulation.

## Reproduction

`pnpm run typecheck`; `pnpm run build:bundle`; `pnpm run check:studio-bundle`.

With an isolated local Vite server: `node scripts/verify-studio-drawing-ux-v2.mjs http://127.0.0.1:5258 chromium,firefox`.
Screenshots and execution logs remain generated artifacts, not committed source.
