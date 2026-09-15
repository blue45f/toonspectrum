import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import {
  retainStudioProductionJobs,
  studioProductionJobSchema,
  type StudioProductionJob,
} from "./studio-production-jobs";

import type { StudioLocalDatabase } from "../studio-local-database";

export const STUDIO_PRODUCTION_JOB_NAMESPACE = "studio-production-jobs-v1";
const GLOBAL_SCOPE = "global";

export interface StudioProductionJobRepository {
  load(projectId?: string | null): Promise<readonly StudioProductionJob[]>;
  save(jobs: readonly StudioProductionJob[], projectId?: string | null): Promise<void>;
  remove(jobId: string, projectId?: string | null): Promise<readonly StudioProductionJob[]>;
}

function scopeKey(projectId?: string | null): string {
  const value = projectId?.trim();
  if (!value) return GLOBAL_SCOPE;
  if (value.length > 160 || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("유효한 프로젝트 작업 범위가 필요합니다.");
  }
  return `project:${value}`;
}

function parseStoredJobs(raw: string): readonly StudioProductionJob[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("저장된 제작 작업 목록이 손상되었습니다.");
  return retainStudioProductionJobs(parsed.map((entry) => studioProductionJobSchema.parse(entry)));
}

export function createStudioProductionJobRepository(options: {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
} = {}): StudioProductionJobRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;

  const write = async (
    jobs: readonly StudioProductionJob[],
    projectId?: string | null,
  ): Promise<void> => {
    const key = scopeKey(projectId);
    const retained = retainStudioProductionJobs(jobs);
    const commit = async () => {
      const database = await acquireDatabase();
      await database.kvSet(STUDIO_PRODUCTION_JOB_NAMESPACE, key, JSON.stringify(retained));
    };
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:${key}`, commit);
    } else {
      await commit();
    }
  };

  return Object.freeze({
    async load(projectId?: string | null) {
      const key = scopeKey(projectId);
      const raw = await (await acquireDatabase()).kvGet(STUDIO_PRODUCTION_JOB_NAMESPACE, key);
      return raw === null ? Object.freeze([]) : parseStoredJobs(raw);
    },
    save: write,
    async remove(jobId: string, projectId?: string | null) {
      const jobs = await this.load(projectId);
      const next = jobs.filter((job) => job.id !== jobId);
      await write(next, projectId);
      return next;
    },
  });
}

let productRepository: StudioProductionJobRepository | null = null;

export function openStudioProductionJobRepository(): StudioProductionJobRepository {
  productRepository ??= createStudioProductionJobRepository();
  return productRepository;
}
