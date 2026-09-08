// Opt-in native HTTP server for Vercel Fluid Compute WebSocket upgrades.
// Ordinary /api requests continue to use api/index.js and never create this LISTEN pool.
const { createStudioLiveVercelServer } = require("../apps/api/dist/apps/api/src/studio-live-serverless");

module.exports = createStudioLiveVercelServer().server;
