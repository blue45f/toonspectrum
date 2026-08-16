/**
 * Shared workspace geometry constants used across panel, dock, and toolbar layout.
 *
 * Centralizing these keeps UX tweaks (ex: wider canvas-first layouts) easy and
 * avoids silent divergence between visual shell components and runtime inset math.
 */
export const STUDIO_WORKSPACE_LEFT_PANEL_MIN_WIDTH = 128;
export const STUDIO_WORKSPACE_LEFT_PANEL_DEFAULT_WIDTH = 160;
export const STUDIO_WORKSPACE_LEFT_PANEL_MAX_WIDTH = 360;
export const STUDIO_WORKSPACE_RIGHT_PANEL_MIN_WIDTH = 240;
export const STUDIO_WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH = 280;
export const STUDIO_WORKSPACE_RIGHT_PANEL_MAX_WIDTH = 720;

export const STUDIO_CANVAS_DRAW_TOOL_RAIL_WIDTH = 48;
export const STUDIO_CANVAS_DOCK_GAP_OPEN = 8;
