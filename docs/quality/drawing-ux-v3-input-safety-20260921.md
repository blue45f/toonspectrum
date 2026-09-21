# Drawing UX v3: input accessibility and saved configurations

Status: implemented; exact-head checks and merge status are recorded in the pull request.

## Current behavior

- Color sets have one Tab entry. Left/right, up/down and Home/End move focus without applying a color. Vertical movement follows rendered rows; Enter/Space use the existing button action. Composition and modified arrows remain untouched.
- Recent-color reordering keeps the focused color as the entry when it still exists. Removing it restores a valid entry. Existing explicit popup apply/cancel and dock gesture commits retain their original authority.
- Copy and eyedropper actions have 44px targets. Invalid HEX drafts cannot silently copy the previous valid color.
- Resizing the color sheet reveals the focused field inside its own scrolling body without replacing focus or the text selection.
- Saved toolbar profiles can be renamed or explicitly deleted. Empty/duplicate rename requests are rejected. Deleting a profile preserves the current tool layout and releases one of the existing 12 profile slots.
- Profile changes remain in the customizer draft until Apply. Cancelling or declining deletion never writes preferences.
- The all-tools catalog loads only on user intent. Its shell stays closable during loading/failure, provides retry, ignores late completion after closing, and does not reclaim focus from another task.
- The production menu verifier now checks the actual localized image action and opens/cancels a real file chooser. It closes persistent Quick Access explicitly rather than clicking arbitrary canvas coordinates.

## Verification

The existing drawing browser command covers actual SQLite/OPFS reload, 27/35 ordered pins, profile rename, confirmed deletion, keyboard color choice, invalid-copy protection and 390/360/320px mobile docks. The viewport is shrunk to 420px to check input clearance and unchanged selection; this is viewport emulation, not physical keyboard certification.

```sh
node scripts/verify-studio-drawing-ux-v2.mjs http://127.0.0.1:5258 chromium,firefox
pnpm exec tsx scripts/verify-studio-menus.mts
pnpm run typecheck
pnpm run build:bundle && pnpm run check:studio-bundle
```

No drawing engine, document history, storage authority, server API, database, production deployment, CI threshold or branch protection is changed. Previous WebKit OPFS and physical-device certification limitations remain open. Screenshots/logs are generated artifacts, not committed source.
