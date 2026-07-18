import type { SvgExportPageInput, SvgExportResult } from "./studio-svg-export";

export const STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioSvgExportWorkerRunMessage {
  type: "studio-svg-export/run";
  version: typeof STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION;
  input: SvgExportPageInput;
}

export interface StudioSvgExportWorkerSuccessMessage {
  type: "studio-svg-export/success";
  version: typeof STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION;
  result: SvgExportResult;
}

export interface StudioSvgExportWorkerReadyMessage {
  type: "studio-svg-export/ready";
  version: typeof STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION;
}

export interface StudioSvgExportWorkerFailureMessage {
  type: "studio-svg-export/failure";
  version: typeof STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioSvgExportWorkerResponseMessage =
  | StudioSvgExportWorkerReadyMessage
  | StudioSvgExportWorkerSuccessMessage
  | StudioSvgExportWorkerFailureMessage;
