import { runDryMediaParityProbe } from "./dry-media-parity-browser";

window.__probeDone = false;
window.__probeResult = null;
try {
  window.__probeResult = await runDryMediaParityProbe();
} catch (error) {
  window.__probeResult = {
    ok: false,
    error: "entry: " + String(error instanceof Error ? error.stack : error),
  };
}
window.__probeDone = true;
