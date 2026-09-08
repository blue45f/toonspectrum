/** Pure routing contract between authored Guided Help and the measured support center. */

import type {
  StudioHelpCenterRequest,
  StudioHelpCenterSection,
} from "./studio-help-center-channel";

export type StudioMeasuredHelpSection = Exclude<
  StudioHelpCenterSection,
  "current-tool"
>;

export type StudioHelpSurfaceRoute =
  | Readonly<{
      surface: "guided";
      toolCommandId: string | null;
    }>
  | Readonly<{
      surface: "measured";
      section: StudioMeasuredHelpSection;
      toolCommandId: string | null;
    }>;

export function resolveStudioHelpSurface(
  request: StudioHelpCenterRequest,
): StudioHelpSurfaceRoute {
  if (request.section === "current-tool") {
    return {
      surface: "guided",
      toolCommandId: request.toolCommandId ?? null,
    };
  }
  return {
    surface: "measured",
    section: request.section,
    toolCommandId: request.toolCommandId ?? null,
  };
}
