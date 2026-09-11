import { summarizeStudioLocalization, type StudioLocalizationUnit } from "./studio-localization-workflow";
import {
  updateStudioProjectWorkspaceState,
  type StudioProjectWorkspaceEventTarget,
} from "./studio-project-workspace-store";

import type {
  StudioCharacterContinuityState,
  StudioContinuityTransition,
  StudioStoryBible,
} from "./studio-story-bible";
import type { StudioProductionTask } from "./studio-production-pipeline";
import type { StudioReviewSession } from "./studio-review-workflow";
import type { StudioExportPreflightResult } from "./studio-export-preflight";
import type {
  StudioDiagnosticAssetStatus,
  StudioProjectDiagnosticAsset,
} from "./studio-project-diagnostics";
import type { StudioProjectDiagnosticSourceStorage } from "./studio-project-diagnostic-source-store";

interface MutationOptions {
  readonly updatedAt?: string;
  readonly target?: StudioProjectWorkspaceEventTarget;
}

function options(input: MutationOptions) {
  return { updatedAt: input.updatedAt, target: input.target };
}

/** Replaces the Story Bible and continuity projection without touching production or review state. */
export function updateStudioProjectStory(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  input: {
    readonly bible: StudioStoryBible;
    readonly states: readonly StudioCharacterContinuityState[];
    readonly transitions: readonly StudioContinuityTransition[];
  },
  mutationOptions: MutationOptions = {},
) {
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => ({
      ...current,
      story: Object.freeze({
        bible: input.bible,
        states: Object.freeze([...input.states]),
        transitions: Object.freeze([...input.transitions]),
      }),
    }),
    options(mutationOptions),
  );
}

/** Replaces the persisted production plan while preserving the rest of project state. */
export function updateStudioProjectProduction(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  tasks: readonly StudioProductionTask[],
  mutationOptions: MutationOptions = {},
) {
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => ({ ...current, productionTasks: Object.freeze([...tasks]) }),
    options(mutationOptions),
  );
}

/** Stores the project-level asset rights/compatibility result used by readiness and export. */
export function updateStudioProjectAssets(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  assets: readonly StudioProjectDiagnosticAsset[],
  mutationOptions: MutationOptions = {},
) {
  const seen = new Set<string>();
  const normalized = assets.map((asset) => {
    const id = asset.id.trim();
    if (!id || seen.has(id)) throw new Error("Project asset ids must be unique and non-empty.");
    seen.add(id);
    const status: StudioDiagnosticAssetStatus = asset.status;
    return Object.freeze({ id, status });
  });
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => ({ ...current, assets: Object.freeze(normalized) }),
    options(mutationOptions),
  );
}

/** Stores the active review/approval session; approved versions remain immutable in the workflow module. */
export function updateStudioProjectReview(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  reviewSession: StudioReviewSession,
  mutationOptions: MutationOptions = {},
) {
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => ({ ...current, reviewSession }),
    options(mutationOptions),
  );
}

/** Converts detailed localization units into per-language project readiness summaries. */
export function updateStudioProjectLocalization(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  units: readonly StudioLocalizationUnit[],
  mutationOptions: MutationOptions = {},
) {
  const locales = new Map<string, StudioLocalizationUnit[]>();
  for (const unit of units) {
    const key = unit.targetLocale.trim();
    if (!key) throw new Error("Localization units require a target locale.");
    const list = locales.get(key) ?? [];
    list.push(unit);
    locales.set(key, list);
  }
  const localization = [...locales.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([locale, localeUnits]) => {
      const summary = summarizeStudioLocalization(localeUnits);
      const status = summary.blocking > 0
        ? "blocked" as const
        : summary.completed === summary.total && summary.warnings === 0
          ? "complete" as const
          : "review" as const;
      return Object.freeze({
        locale,
        status,
        blockingIssueCount: summary.blocking,
        warningIssueCount: summary.warnings,
      });
    });
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => ({ ...current, localization: Object.freeze(localization) }),
    options(mutationOptions),
  );
}

/** Upserts one export preflight by destination/policy so repeated checks never create duplicates. */
export function updateStudioProjectExportPreflight(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  preflight: StudioExportPreflightResult,
  mutationOptions: MutationOptions = {},
) {
  return updateStudioProjectWorkspaceState(
    storage,
    projectId,
    (current) => {
      const next = current.exportPreflights.filter(
        (candidate) => candidate.target !== preflight.target || candidate.policyVersion !== preflight.policyVersion,
      );
      next.push(preflight);
      next.sort((a, b) => `${a.target}\u0000${a.policyVersion}`.localeCompare(`${b.target}\u0000${b.policyVersion}`));
      return { ...current, exportPreflights: Object.freeze(next) };
    },
    options(mutationOptions),
  );
}
