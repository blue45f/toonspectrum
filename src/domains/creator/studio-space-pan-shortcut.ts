const STUDIO_SPACE_PAN_INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "summary",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']",
].join(",");

/**
 * Space pans the canvas only from canvas/background focus. Native controls must keep their
 * browser activation behavior; preventing Space on a focused button makes it look keyboard-dead.
 */
export function shouldStartStudioSpacePan(input: {
  readonly code: string;
  readonly editing: boolean;
  readonly isSpacePressed: boolean;
  readonly target: EventTarget | null;
}): boolean {
  if (input.code !== "Space" || input.editing || input.isSpacePressed) return false;
  const candidate = input.target as { closest?: (selector: string) => Element | null } | null;
  return !candidate?.closest?.(STUDIO_SPACE_PAN_INTERACTIVE_SELECTOR);
}
