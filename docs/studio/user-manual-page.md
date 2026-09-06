# Studio public user manual

## Product decision

A reference manual is distinct from creative tutorials and the runtime help dialog. `/studio/manual` is the public index; `/studio/manual/:articleId` is a bookmarkable article. The Help menu opens the manual in a new tab with noopener/noreferrer so an unsaved editor is never replaced.

Fourteen original Korean articles cover starting, workspace, brushes, selections/fill, layers, lettering, assets, characters, 3D backgrounds, filters, save/recovery, export, shortcuts and troubleshooting. The page explicitly says it is Korean when reached from the English Help menu. Other locales are not claimed as translated.

## Evidence and copy boundaries

Reference structure benchmark: https://help.clip-studio.com/en-us/ and https://www.clipstudio.net/en/manuals/ (reviewed 2026-09-06). No competitor text or screenshots copied.

ToonStudio source basis at commit 7707c5e2cc9a10fc09bf9822f9f81387f2e44e89:
- STUDIO_MANUAL.md (broad feature outline, not blindly republished)
- src/domains/creator/StudioShortcutsHelp.tsx (documented default shortcut subset)
- src/domains/creator/studio-help-menu-items.ts (actual help entry labels)
- src/domains/creator/StudioHelpCenterDialog.tsx (diagnosis/recovery/report capabilities)
- src/domains/creator/studio-workspace-route.ts (workspace destinations)

No fixed publishing-platform dimensions, guaranteed recovery, universal model/engine support, or live custom shortcut synchronization is promised. Manual text never starts a diagnostics scan, camera, GPU renderer, storage reset or document write.

## Architecture

The two explicit lazy creator routes outrank `/studio/*` and bypass StudioRouter's editor/dictionary loader. AppRouter yields document title ownership to the manual. Data and search stay inside the lazy manual graph; the Help menu contains only a URL, not an import of all article content. Search is bounded, literal, Unicode-normalized AND-token matching with title/alias ranking and category filters. Search remains local to avoid the Studio route stage remounting on every search-parameter change; terms are neither sent to a server nor persisted.

The manual owns scrolling inside the immersive 100dvh shell. Print CSS explicitly releases the outer main container's fixed height/overflow. Native mobile details, named landmarks, a skip link, focus styles, live result counts and clipboard failure fallback are included. Documents have stable section anchors, related links and previous/next navigation.

## Verification

- `pnpm exec vitest run src/domains/creator/manual/studio-manual.test.ts src/app/routes/groups/studio-manual.routes.test.tsx`
- `pnpm exec eslint src/domains/creator/manual src/app/routes/groups/studio-manual.routes.test.tsx`
- `pnpm run build:bundle && node scripts/verify-studio-manual.mjs` (Chromium required)

The dedicated workflow runs index/deep-link/reload/search/category/unknown-URL/clipboard/print/mobile checks against the production bundle and uploads screenshots and a JSON result. Existing repository CI remains unchanged and must execute independently. Adding test code is not a claim that the checks have passed; inspect the exact PR head's workflow results.

## Maintenance

Update article text, aliases and related IDs with the affected feature. Keep unsupported cases explicit. Update MANUAL_UPDATED only when content is reviewed. Content/route tests guard IDs, link integrity, basic copy boundaries and route ownership. Avoid importing renderer/editor code to render examples: demonstrations should remain opt-in, isolated additions.
