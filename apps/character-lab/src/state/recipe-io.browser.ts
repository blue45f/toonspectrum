/**
 * 브라우저 전용 파일 열기·저장. 테스트 파일은 이 모듈을 import하지 않는다(브라우저 검증 필요).
 *
 * - `showSaveFilePicker`/`showOpenFilePicker`(File System Access API)가 있으면 사용한다.
 * - 없으면 `<a download>` + `URL.revokeObjectURL` / `<input type="file">`로 대신한다. 이 선택은
 *   capability 분기이며(판정은 recipe-io.ts `openMethodFor`/`saveMethodFor`, Node 테스트 있음)
 *   반환값(`SaveMethod`)으로 어떤 경로를 썼는지 호출자에게 알린다.
 * - 사용자 취소(AbortError)는 null, 그 밖의 오류는 그대로 throw한다(호출자가 failure로 노출).
 */
import { RECIPE_MIME_TYPE, isAbortError, openMethodFor, saveMethodFor } from "./recipe-io";

import type { FileAccessHost, OpenMethod, SaveMethod } from "./recipe-io";

export type { FileAccessHost, OpenMethod, SaveMethod } from "./recipe-io";
export { isAbortError, openMethodFor, saveMethodFor } from "./recipe-io";

interface WritableLike {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

interface PickerType {
  readonly description?: string;
  readonly accept: Record<string, readonly string[]>;
}

export interface PickerWindow extends FileAccessHost {
  readonly showOpenFilePicker?: (options: { readonly multiple: false; readonly types: readonly PickerType[] }) => Promise<readonly FileHandleLike[]>;
  readonly showSaveFilePicker?: (options: { readonly suggestedName: string; readonly types: readonly PickerType[] }) => Promise<FileHandleLike>;
}

export interface OpenedRecipeFile {
  readonly name: string;
  readonly text: string;
}

const RECIPE_PICKER_TYPES: readonly PickerType[] = [{ description: "캐릭터 레시피(JSON)", accept: { [RECIPE_MIME_TYPE]: [".json"] } }];

function openWithInput(doc: Document): Promise<OpenedRecipeFile | null> {
  return new Promise((resolve, reject) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = `${RECIPE_MIME_TYPE},.json`;
    input.style.display = "none";
    const cleanup = (): void => {
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch((error: unknown) => reject(error instanceof Error ? error : new Error(String(error))));
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    doc.body.append(input);
    input.click();
  });
}

/** 레시피 파일을 연다. 취소하면 null. 두 번째 반환값은 사용한 경로다. */
export async function openRecipeFile(win: Window & PickerWindow = window as Window & PickerWindow): Promise<OpenedRecipeFile | null> {
  const method: OpenMethod = openMethodFor(win);
  if (method === "file-system-access" && win.showOpenFilePicker) {
    try {
      const [handle] = await win.showOpenFilePicker({ multiple: false, types: RECIPE_PICKER_TYPES });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }
  return openWithInput(win.document);
}

function saveWithAnchor(doc: Document, name: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  doc.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // 클릭 처리 후 revoke(동기 revoke는 일부 브라우저에서 다운로드가 취소된다).
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** 텍스트 파일을 저장한다. 취소하면 null, 아니면 사용한 경로를 돌려준다. */
export async function saveTextFile(
  name: string,
  text: string,
  mime: string = RECIPE_MIME_TYPE,
  win: Window & PickerWindow = window as Window & PickerWindow,
): Promise<SaveMethod | null> {
  const method: SaveMethod = saveMethodFor(win);
  if (method === "file-system-access" && win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({ suggestedName: name, types: [{ description: "캐릭터 레시피(JSON)", accept: { [mime]: [".json"] } }] });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return "file-system-access";
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }
  saveWithAnchor(win.document, name, text, mime);
  return "anchor-download";
}
