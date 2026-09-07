import { diffCharacterDocuments } from "../document/character-document-diff";
import { isCharacterDocumentV2 } from "../document/character-document-v2";

import type { CharacterDocumentDiffEntry } from "../document/character-document-diff";
import type { CharacterDocumentV2 } from "../document/character-document-v2";

export type CharacterCommandSource = "user" | "ai-recommendation" | "photo-pose" | "webcam" | "migration";

export interface CharacterCommand<TPayload> {
  readonly commandId: string;
  readonly kind: string;
  readonly label: string;
  readonly expectedRevision: number;
  readonly source: CharacterCommandSource;
  readonly payload: TPayload;
}

export interface CharacterCommandReceipt {
  readonly commandId: string;
  readonly kind: string;
  readonly label: string;
  readonly source: CharacterCommandSource;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly changedPaths: readonly string[];
  readonly diff: readonly CharacterDocumentDiffEntry[];
  readonly committedAt: string;
}

export type CharacterCommandErrorCode =
  | "invalid-command"
  | "revision-conflict"
  | "reducer-failed"
  | "invalid-document"
  | "document-identity-changed"
  | "no-change";

export interface CharacterCommandFailure {
  readonly ok: false;
  readonly code: CharacterCommandErrorCode;
  readonly message: string;
  readonly currentRevision: number;
  readonly cause?: unknown;
}

export interface CharacterCommandSuccess {
  readonly ok: true;
  readonly document: CharacterDocumentV2;
  readonly receipt: CharacterCommandReceipt;
}

export type CharacterCommandDispatchResult = CharacterCommandSuccess | CharacterCommandFailure;
export type CharacterCommandReducer<TPayload> = (
  document: CharacterDocumentV2,
  payload: TPayload,
) => CharacterDocumentV2;

export interface CharacterCommandDispatchOptions {
  readonly now?: () => string;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function failure(
  document: CharacterDocumentV2,
  code: CharacterCommandErrorCode,
  message: string,
  cause?: unknown,
): CharacterCommandFailure {
  return {
    ok: false,
    code,
    message,
    currentRevision: document.revision,
    ...(cause === undefined ? {} : { cause }),
  };
}

export function dispatchCharacterCommand<TPayload>(
  document: CharacterDocumentV2,
  command: CharacterCommand<TPayload>,
  reducer: CharacterCommandReducer<TPayload>,
  options: CharacterCommandDispatchOptions = {},
): CharacterCommandDispatchResult {
  if (!nonEmpty(command.commandId) || !nonEmpty(command.kind) || !nonEmpty(command.label)) {
    return failure(document, "invalid-command", "명령 식별자와 이름이 필요합니다.");
  }
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    return failure(document, "invalid-command", "명령의 기준 버전이 올바르지 않습니다.");
  }
  if (command.expectedRevision !== document.revision) {
    return failure(
      document,
      "revision-conflict",
      `캐릭터가 이미 변경되었습니다. 현재 버전은 ${document.revision}입니다.`,
    );
  }

  let reduced: CharacterDocumentV2;
  try {
    reduced = reducer(document, command.payload);
  } catch (cause) {
    return failure(document, "reducer-failed", "캐릭터 변경을 준비하지 못했습니다.", cause);
  }
  if (!isCharacterDocumentV2(reduced)) {
    return failure(document, "invalid-document", "변경 결과가 유효한 캐릭터 문서가 아닙니다.");
  }
  if (reduced.documentId !== document.documentId || reduced.schemaVersion !== document.schemaVersion) {
    return failure(document, "document-identity-changed", "명령은 문서 식별자나 형식 버전을 바꿀 수 없습니다.");
  }

  const diff = diffCharacterDocuments(document, reduced);
  if (diff.length === 0) {
    return failure(document, "no-change", "변경할 값이 없습니다.");
  }

  const committedAt = options.now?.() ?? new Date().toISOString();
  const committed: CharacterDocumentV2 = {
    ...reduced,
    revision: document.revision + 1,
    createdAt: document.createdAt,
    updatedAt: committedAt,
  };
  if (!isCharacterDocumentV2(committed)) {
    return failure(document, "invalid-document", "커밋 결과가 유효한 캐릭터 문서가 아닙니다.");
  }

  return {
    ok: true,
    document: committed,
    receipt: Object.freeze({
      commandId: command.commandId,
      kind: command.kind,
      label: command.label,
      source: command.source,
      beforeRevision: document.revision,
      afterRevision: committed.revision,
      changedPaths: Object.freeze(diff.map((entry) => entry.path)),
      diff,
      committedAt,
    }),
  };
}
