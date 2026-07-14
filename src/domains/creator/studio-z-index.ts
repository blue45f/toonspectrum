/**
 * Studio stacking scale — single source for menu / chrome / modal z-index.
 *
 * Problem this solves: menubar dropdowns used `absolute z-80` inside a parent with
 * auto z-index, while the draw-options strip is a later sibling — so options paint
 * over open File/Edit menus. Fixed popovers also collided with each other (all z-80).
 *
 * Layers (low → high), all inside the studio shell stacking context:
 *   10  canvas HUD (status, zoom floats)
 *   20  left tool rail
 *   30  tool belt (legacy / mobile host)
 *   40  draw / select options strips
 *   50  app menubar (must stay above options so dropdowns win)
 *   60  menubar-affiliated dropdowns (export, project, main menu panels)
 *   70  tool-group popovers (assets / bg / style / AI)
 *   80  full-screen studio modals (storyboard, 3D, checkpoints…)
 *   90  confirm / legal / critical banners
 *  100  workspace menu (must top most chrome menus)
 *  110  shortcuts help / brush studio
 *  120  emergency legal notices
 */

export const STUDIO_Z = {
  canvasHud: 10,
  toolRail: 20,
  toolBelt: 30,
  optionsStrip: 40,
  menubar: 50,
  menubarMenu: 60,
  toolPopover: 70,
  modal: 80,
  confirm: 90,
  workspace: 100,
  help: 110,
  legal: 120,
} as const;

export type StudioZLayer = keyof typeof STUDIO_Z;

/** Tailwind arbitrary z class helpers — keep in sync with STUDIO_Z. */
export const STUDIO_Z_CLASS = {
  canvasHud: "z-[10]",
  toolRail: "z-[20]",
  toolBelt: "z-30",
  optionsStrip: "z-[40]",
  menubar: "z-[50]",
  menubarMenu: "z-[60]",
  toolPopover: "z-[70]",
  modal: "z-[80]",
  confirm: "z-[90]",
  workspace: "z-[100]",
  help: "z-[110]",
  legal: "z-[120]",
} as const;
