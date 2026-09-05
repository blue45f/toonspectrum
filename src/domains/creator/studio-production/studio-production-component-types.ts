import type {
  StudioProductionScope,
  StudioProductionWorkspace,
} from "./studio-production-model";

export type StudioProductionCommit = (
  audit: {
    readonly action: string;
    readonly detail?: string;
    readonly actor?: string;
  },
  updater: (workspace: StudioProductionWorkspace) => StudioProductionWorkspace,
) => StudioProductionWorkspace;

export interface StudioProductionSurfaceProps {
  readonly workspace: StudioProductionWorkspace;
  readonly scope: StudioProductionScope;
  readonly commit: StudioProductionCommit;
}
