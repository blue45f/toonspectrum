// Compatibility entry for the former static-home audit. The actual interactive-home
// suite now checks canvas movement, search input ownership, personal isolation, mobile
// navigation, view switching and accessibility. Exact-document recovery stays covered
// by StudioWorkspacePage.continuity.test.tsx and the live-home browser journey.
await import("./qa-studio-main-release.mjs");
