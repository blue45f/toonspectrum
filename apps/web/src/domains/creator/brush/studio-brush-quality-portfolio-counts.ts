/**
 * Launch-safe product counts for the curated quality portfolio.
 *
 * Keep this tiny leaf separate from the detailed profile module so always-visible Studio chrome
 * does not pull texture/hand-feel metadata into the initial chunk. The portfolio contract test
 * proves these numbers match the full manifest.
 */
export const STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS = Object.freeze({
  total: 95,
  paint: 93,
  erase: 2,
});
