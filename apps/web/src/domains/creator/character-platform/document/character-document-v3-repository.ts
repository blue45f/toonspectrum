import {
  parseCharacterDocumentV3,
  serializeCharacterDocumentV3,
  type CharacterDocumentV3,
} from "./character-document-v3";

import type { StudioAsyncKeyValueStore } from "../../studio-local-database";

export const CHARACTER_DOCUMENT_V3_SQLITE_NAMESPACE = "studio-character-document-v3-v1";
export const CHARACTER_DOCUMENT_V3_MAX_BYTES = 8 * 1024 * 1024;

export type CharacterDocumentV3SaveStatus = "saved" | "unchanged";

export interface CharacterDocumentV3SaveReceipt {
  readonly status: CharacterDocumentV3SaveStatus;
  readonly documentId: string;
  readonly revision: number;
  readonly byteLength: number;
}

export class CharacterDocumentV3RepositoryError extends Error {
  constructor(
    readonly code: "capacity" | "revision-conflict" | "revision-regression" | "identity-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "CharacterDocumentV3RepositoryError";
  }
}

export interface CharacterDocumentV3RepositoryOptions {
  readonly storeFactory?: () => Promise<StudioAsyncKeyValueStore>;
}

async function defaultStoreFactory(): Promise<StudioAsyncKeyValueStore> {
  const { acquireStudioLocalDatabase } = await import("../../studio-local-database-runtime");
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(CHARACTER_DOCUMENT_V3_SQLITE_NAMESPACE);
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export class CharacterDocumentV3Repository {
  readonly #storeFactory: () => Promise<StudioAsyncKeyValueStore>;
  readonly #tails = new Map<string, Promise<unknown>>();

  constructor(options: CharacterDocumentV3RepositoryOptions = {}) {
    this.#storeFactory = options.storeFactory ?? defaultStoreFactory;
  }

  async load(documentId: string): Promise<CharacterDocumentV3 | null> {
    return this.#enqueue(documentId, async () => {
      const raw = await (await this.#storeFactory()).get(documentId);
      if (!raw) return null;
      const parsed = parseCharacterDocumentV3(JSON.parse(raw));
      if (parsed.documentId !== documentId) {
        throw new CharacterDocumentV3RepositoryError(
          "identity-mismatch",
          `저장된 캐릭터 문서 ${parsed.documentId}과 요청한 ${documentId}이 다릅니다.`,
        );
      }
      return parsed;
    });
  }

  async save(
    document: CharacterDocumentV3,
    options: { readonly expectedStoredRevision?: number; readonly allowRevisionRegression?: boolean } = {},
  ): Promise<CharacterDocumentV3SaveReceipt> {
    const serialized = serializeCharacterDocumentV3(document);
    const byteLength = bytes(serialized);
    if (byteLength > CHARACTER_DOCUMENT_V3_MAX_BYTES) {
      throw new CharacterDocumentV3RepositoryError(
        "capacity",
        `캐릭터 문서가 ${CHARACTER_DOCUMENT_V3_MAX_BYTES}바이트 저장 한도를 넘었습니다.`,
      );
    }
    return this.#enqueue(document.documentId, async () => {
      const store = await this.#storeFactory();
      const currentRaw = await store.get(document.documentId);
      if (currentRaw === serialized) {
        return Object.freeze({
          status: "unchanged" as const,
          documentId: document.documentId,
          revision: document.revision,
          byteLength,
        });
      }
      if (currentRaw) {
        const current = parseCharacterDocumentV3(JSON.parse(currentRaw));
        if (options.expectedStoredRevision !== undefined
          && current.revision !== options.expectedStoredRevision) {
          throw new CharacterDocumentV3RepositoryError(
            "revision-conflict",
            `저장된 revision은 ${current.revision}이지만 ${options.expectedStoredRevision}을 예상했습니다.`,
          );
        }
        if (document.revision < current.revision && options.allowRevisionRegression !== true) {
          throw new CharacterDocumentV3RepositoryError(
            "revision-regression",
            `캐릭터 문서 revision을 ${current.revision}에서 ${document.revision}(으)로 되돌릴 수 없습니다.`,
          );
        }
      } else if (options.expectedStoredRevision !== undefined) {
        throw new CharacterDocumentV3RepositoryError(
          "revision-conflict",
          "저장된 캐릭터 문서가 없지만 기존 revision을 예상했습니다.",
        );
      }
      await store.set(document.documentId, serialized);
      return Object.freeze({
        status: "saved" as const,
        documentId: document.documentId,
        revision: document.revision,
        byteLength,
      });
    });
  }

  async remove(documentId: string): Promise<void> {
    await this.#enqueue(documentId, async () => {
      await (await this.#storeFactory()).delete(documentId);
    });
  }

  #enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const run = (this.#tails.get(key) ?? Promise.resolve()).then(operation, operation);
    this.#tails.set(key, run);
    const retire = () => {
      if (this.#tails.get(key) === run) this.#tails.delete(key);
    };
    void run.then(retire, retire);
    return run;
  }
}

let sharedRepository: CharacterDocumentV3Repository | null = null;

export function getCharacterDocumentV3Repository(): CharacterDocumentV3Repository {
  sharedRepository ??= new CharacterDocumentV3Repository();
  return sharedRepository;
}
