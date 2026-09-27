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
    readonly code: "capacity" | "revision-conflict" | "revision-regression" | "identity-mismatch"
      | "invalid-id" | "invalid-revision" | "atomic-lock-unavailable" | "cancelled" | "cancelled-after-write",
    message: string,
  ) {
    super(message);
    this.name = "StudioWebAuthoringProjectRepositoryError";
  }
}

/** 주입하는 잠금도 동일 origin의 모든 저장소 instance가 문서별로 공유해야 한다. */
export interface StudioWebAuthoringProjectLockProvider {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
    operation: () => Promise<T>,
  ): Promise<T>;
}

export interface StudioWebAuthoringProjectRepositoryOptions {
  readonly storeFactory?: () => Promise<StudioAsyncKeyValueStore>;
  readonly lockProvider?: StudioWebAuthoringProjectLockProvider | null;
}

export interface StudioWebAuthoringProjectReadOptions {
  readonly signal?: AbortSignal;
}

export interface StudioWebAuthoringProjectWriteOptions extends StudioWebAuthoringProjectReadOptions {
  /** null은 최초 저장으로, 문서가 없어야 한다. undefined는 revision 사전 조건을 생략한다. */
  readonly expectedStoredRevision?: number | null;
  readonly allowRevisionRegression?: boolean;
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

function assertProjectId(projectId: string): void {
  if (typeof projectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u.test(projectId)) {
    throw new StudioWebAuthoringProjectRepositoryError("invalid-id", "프로젝트 ID 형식이 올바르지 않습니다.");
  }
}

function assertExpectedRevision(revision: number | null | undefined): void {
  if (revision !== undefined && revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    throw new StudioWebAuthoringProjectRepositoryError("invalid-revision", "예상 저장 revision이 올바르지 않습니다.");
  }
}

function checkCancelled(signal?: AbortSignal, writeCompleted = false): void {
  if (!signal?.aborted) return;
  throw new StudioWebAuthoringProjectRepositoryError(
    writeCompleted ? "cancelled-after-write" : "cancelled",
    writeCompleted
      ? "취소 전에 로컬 쓰기가 완료되었습니다. 다시 불러온 뒤 계속하세요."
      : "로컬 프로젝트 작업을 취소했습니다.",
  );
}

function parseStoredProject(raw: string, projectId: string): StudioWebAuthoringProjectV3 {
  const project = parseStudioWebAuthoringProjectV3(raw);
  if (project.projectId !== projectId) {
    throw new StudioWebAuthoringProjectRepositoryError(
      "identity-mismatch",
      `저장된 프로젝트 ${project.projectId}과 요청한 ${projectId}이 다릅니다.`,
    );
  }
  return project;
}

function assertStoredRevision(
  current: StudioWebAuthoringProjectV3 | null,
  expected: number | null | undefined,
): void {
  if (expected === undefined || (current?.revision ?? null) === expected) return;
  throw new StudioWebAuthoringProjectRepositoryError(
    "revision-conflict",
    `저장된 project revision은 ${current?.revision ?? "없음"}이지만 ${expected ?? "없음"}을 예상했습니다.`,
  );
}

export class StudioWebAuthoringProjectV3Repository {
  readonly #storeFactory: () => Promise<StudioAsyncKeyValueStore>;
  readonly #lockProvider: StudioWebAuthoringProjectLockProvider | null | undefined;
  readonly #tails = new Map<string, Promise<unknown>>();

  constructor(options: StudioWebAuthoringProjectRepositoryOptions = {}) {
    this.#storeFactory = options.storeFactory ?? defaultStoreFactory;
    this.#lockProvider = options.lockProvider;
  }

  get supportsAtomicWrites(): boolean {
    return this.#resolveLocks() !== null;
  }

  async load(
    projectId: string,
    { signal }: StudioWebAuthoringProjectReadOptions = {},
  ): Promise<StudioWebAuthoringProjectV3 | null> {
    assertProjectId(projectId);
    checkCancelled(signal);
    return this.#enqueue(projectId, () => this.#withDocumentLock(projectId, signal, false, async () => {
      const raw = await (await this.#storeFactory()).get(projectId);
      checkCancelled(signal);
      if (raw === null) return null;
      return parseStoredProject(raw, projectId);
    }));
  }

  async save(
    project: StudioWebAuthoringProjectV3,
    options: StudioWebAuthoringProjectWriteOptions = {},
  ): Promise<StudioWebAuthoringProjectSaveReceipt> {
    assertProjectId(project.projectId);
    const serialized = serializeStudioWebAuthoringProjectV3(project);
    // 비동기 저장 대기 중 호출자가 입력이나 옵션을 바꿔도 같은 snapshot을 저장한다.
    const { projectId, revision } = project;
    const { expectedStoredRevision, allowRevisionRegression, signal } = options;
    assertExpectedRevision(expectedStoredRevision);
    checkCancelled(signal);
    const byteLength = utf8Bytes(serialized);
    if (byteLength > STUDIO_WEB_AUTHORING_PROJECT_V3_MAX_BYTES) {
      return Promise.reject(new StudioWebAuthoringProjectRepositoryError(
        "capacity",
        `웹 3D 프로젝트가 ${STUDIO_WEB_AUTHORING_PROJECT_V3_MAX_BYTES}바이트 저장 한도를 넘었습니다.`,
      ));
    }
    return this.#enqueue(projectId, () => this.#withDocumentLock(projectId, signal, true, async () => {
      const store = await this.#storeFactory();
      checkCancelled(signal);
      const currentRaw = await store.get(projectId);
      checkCancelled(signal);
      const current = currentRaw === null ? null : parseStoredProject(currentRaw, projectId);
      // 동일 바이트도 사전 조건을 우회하지 않는다. 최초 저장과 경합한 요청을 성공으로 숨기지 않는다.
      assertStoredRevision(current, expectedStoredRevision);
      if (currentRaw === serialized) {
        return Object.freeze({
          status: "unchanged" as const,
          projectId,
          revision,
          byteLength,
        });
      }
      if (current !== null) {
        if (revision === current.revision) {
          throw new StudioWebAuthoringProjectRepositoryError(
            "revision-conflict",
            `동일한 revision ${revision}에 다른 프로젝트 내용을 덮어쓸 수 없습니다.`,
          );
        }
        if (revision < current.revision && allowRevisionRegression !== true) {
          throw new StudioWebAuthoringProjectRepositoryError(
            "revision-regression",
            `프로젝트 revision을 ${current.revision}에서 ${revision}(으)로 되돌릴 수 없습니다.`,
          );
        }
      }
      checkCancelled(signal);
      await store.set(projectId, serialized);
      checkCancelled(signal, true);
      return Object.freeze({
        status: "saved" as const,
        projectId,
        revision,
        byteLength,
      });
    }));
  }

  async remove(projectId: string, options: StudioWebAuthoringProjectWriteOptions = {}): Promise<void> {
    assertProjectId(projectId);
    const { expectedStoredRevision, signal } = options;
    assertExpectedRevision(expectedStoredRevision);
    checkCancelled(signal);
    await this.#enqueue(projectId, () => this.#withDocumentLock(projectId, signal, true, async () => {
      const store = await this.#storeFactory();
      checkCancelled(signal);
      const raw = await store.get(projectId);
      checkCancelled(signal);
      assertStoredRevision(raw === null ? null : parseStoredProject(raw, projectId), expectedStoredRevision);
      await store.delete(projectId);
      checkCancelled(signal, true);
    }));
  }

  #resolveLocks(): StudioWebAuthoringProjectLockProvider | null {
    if (this.#lockProvider !== undefined) return this.#lockProvider;
    if (typeof navigator === "undefined" || !navigator.locks?.request) return null;
    return {
      request: (name, options, operation) => navigator.locks.request(name, options, operation),
    };
  }

  async #withDocumentLock<T>(
    projectId: string,
    signal: AbortSignal | undefined,
    writing: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    checkCancelled(signal);
    const locks = this.#resolveLocks();
    if (!locks) {
      if (!writing) return operation();
      throw new StudioWebAuthoringProjectRepositoryError(
        "atomic-lock-unavailable",
        "이 환경은 Web Locks 문서 잠금을 지원하지 않아 안전한 로컬 저장을 확인할 수 없습니다. JSON 백업을 사용하세요.",
      );
    }
    let entered = false;
    try {
      return await locks.request(
        `${STUDIO_WEB_AUTHORING_PROJECT_V3_SQLITE_NAMESPACE}:${projectId}`,
        { mode: "exclusive", ...(signal ? { signal } : {}) },
        async () => {
          entered = true;
          checkCancelled(signal);
          return operation();
        },
      );
    } catch (error) {
      // 잠금 획득 전 취소만 정규화한다. 쓰기 시작 후 저장소 오류를 취소로 덮지 않는다.
      if (!entered) checkCancelled(signal);
      throw error;
    }
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
