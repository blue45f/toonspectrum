import {
  parseStudioWebAuthoringProjectV3,
  serializeStudioWebAuthoringProjectV3,
  type StudioWebAuthoringProjectV3,
} from "./studio-web-authoring-project-v3";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const STUDIO_WEB_AUTHORING_PROJECT_V3_SQLITE_NAMESPACE = "studio-web-authoring-project-v3-v1";
export const STUDIO_WEB_AUTHORING_PROJECT_V3_MAX_BYTES = 32 * 1024 * 1024;

export interface StudioWebAuthoringProjectSaveReceipt {
  readonly status: "saved" | "unchanged";
  readonly projectId: string;
  readonly revision: number;
  readonly byteLength: number;
}

export class StudioWebAuthoringProjectRepositoryError extends Error {
  constructor(
    readonly code: "capacity" | "revision-conflict" | "revision-regression" | "identity-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "StudioWebAuthoringProjectRepositoryError";
  }
}

export interface StudioWebAuthoringProjectRepositoryOptions {
  readonly storeFactory?: () => Promise<StudioAsyncKeyValueStore>;
}

async function defaultStoreFactory(): Promise<StudioAsyncKeyValueStore> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(
    STUDIO_WEB_AUTHORING_PROJECT_V3_SQLITE_NAMESPACE,
  );
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export class StudioWebAuthoringProjectV3Repository {
  readonly #storeFactory: () => Promise<StudioAsyncKeyValueStore>;
  readonly #tails = new Map<string, Promise<unknown>>();

  constructor(options: StudioWebAuthoringProjectRepositoryOptions = {}) {
    this.#storeFactory = options.storeFactory ?? defaultStoreFactory;
  }

  load(projectId: string): Promise<StudioWebAuthoringProjectV3 | null> {
    return this.#enqueue(projectId, async () => {
      const raw = await (await this.#storeFactory()).get(projectId);
      if (!raw) return null;
      const project = parseStudioWebAuthoringProjectV3(raw);
      if (project.projectId !== projectId) {
        throw new StudioWebAuthoringProjectRepositoryError(
          "identity-mismatch",
          `저장된 프로젝트 ${project.projectId}과 요청한 ${projectId}이 다릅니다.`,
        );
      }
      return project;
    });
  }

  save(
    project: StudioWebAuthoringProjectV3,
    options: { readonly expectedStoredRevision?: number; readonly allowRevisionRegression?: boolean } = {},
  ): Promise<StudioWebAuthoringProjectSaveReceipt> {
    const serialized = serializeStudioWebAuthoringProjectV3(project);
    const byteLength = utf8Bytes(serialized);
    if (byteLength > STUDIO_WEB_AUTHORING_PROJECT_V3_MAX_BYTES) {
      return Promise.reject(new StudioWebAuthoringProjectRepositoryError(
        "capacity",
        `웹 3D 프로젝트가 ${STUDIO_WEB_AUTHORING_PROJECT_V3_MAX_BYTES}바이트 저장 한도를 넘었습니다.`,
      ));
    }
    return this.#enqueue(project.projectId, async () => {
      const store = await this.#storeFactory();
      const currentRaw = await store.get(project.projectId);
      if (currentRaw === serialized) {
        return Object.freeze({
          status: "unchanged" as const,
          projectId: project.projectId,
          revision: project.revision,
          byteLength,
        });
      }
      if (currentRaw) {
        const current = parseStudioWebAuthoringProjectV3(currentRaw);
        if (options.expectedStoredRevision !== undefined
          && current.revision !== options.expectedStoredRevision) {
          throw new StudioWebAuthoringProjectRepositoryError(
            "revision-conflict",
            `저장된 project revision은 ${current.revision}이지만 ${options.expectedStoredRevision}을 예상했습니다.`,
          );
        }
        if (project.revision < current.revision && options.allowRevisionRegression !== true) {
          throw new StudioWebAuthoringProjectRepositoryError(
            "revision-regression",
            `프로젝트 revision을 ${current.revision}에서 ${project.revision}(으)로 되돌릴 수 없습니다.`,
          );
        }
      } else if (options.expectedStoredRevision !== undefined) {
        throw new StudioWebAuthoringProjectRepositoryError(
          "revision-conflict",
          "저장된 프로젝트가 없지만 기존 revision을 예상했습니다.",
        );
      }
      await store.set(project.projectId, serialized);
      return Object.freeze({
        status: "saved" as const,
        projectId: project.projectId,
        revision: project.revision,
        byteLength,
      });
    });
  }

  async remove(projectId: string): Promise<void> {
    await this.#enqueue(projectId, async () => {
      await (await this.#storeFactory()).delete(projectId);
    });
  }

  #enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.#tails.get(key) ?? Promise.resolve()).then(operation, operation);
    this.#tails.set(key, result);
    const retire = () => {
      if (this.#tails.get(key) === result) this.#tails.delete(key);
    };
    void result.then(retire, retire);
    return result;
  }
}

let sharedRepository: StudioWebAuthoringProjectV3Repository | null = null;

export function getStudioWebAuthoringProjectV3Repository(): StudioWebAuthoringProjectV3Repository {
  sharedRepository ??= new StudioWebAuthoringProjectV3Repository();
  return sharedRepository;
}
