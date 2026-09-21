// Compatibility entry for the first drawing UX smoke command.
// The v2 runner covers the same paths plus actual SQLite persistence and the mobile dock.
process.argv[2] ??= "http://127.0.0.1:5197";
await import("./verify-studio-drawing-ux-v2.mjs");
