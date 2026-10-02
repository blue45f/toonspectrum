/**
 * 캔버스에 파일을 끌어 놓았을 때 "이미지가 아닌" 작업 파일을 알맞은 가져오기 흐름으로 보내는 규칙.
 *
 * 캔버스 드롭은 원래 이미지(PNG·JPEG·…)만 받았고, PSD·OpenRaster·CBZ·WILL·브러시 팩을 놓으면
 * "이미지만 놓을 수 있어요"라는 거절만 돌아왔다. 이 모듈은 확장자로 파일 종류를 정해 이미 있는
 * 가져오기 핸들러(프로젝트 센터의 같은 입력창이 쓰는 것)로 넘길 계획만 세운다 — 읽기·검사·손실 미리보기·
 * 적용 확인은 그 핸들러가 그대로 맡으므로 입력·저장·Undo 경로는 달라지지 않는다.
 *
 * 프로젝트 백업(.json·.toonstudio·.zip)은 문서 전체를 바꾸는 파일이라 끌어 놓기 한 번으로 열지 않고,
 * 어디서 여는지만 알려 준다(실수로 놓았다가 작업이 바뀌는 일을 막는다).
 */

import type { ChangeEvent, DragEvent } from "react";

import { studioTransferCanInsert, studioTransferHasFiles } from "../studio-asset-transfer";
import { createStudioFileChangeEvent } from "../studio-cuttoon-editor/studio-synthetic-file-change-event";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

export type StudioCanvasDropImportTarget = "psd" | "interchange" | "brush-pack";

export type StudioCanvasFileDropPlan<TFile extends Pick<File, "name"> = File> =
  /** 해당 가져오기 흐름에 이 파일을 넘긴다. */
  | { readonly kind: "import"; readonly target: StudioCanvasDropImportTarget; readonly file: TFile }
  /** 알아본 파일이지만 끌어 놓기로는 열지 않는다 — 안내 문구만 보여 준다. */
  | { readonly kind: "guide"; readonly message: string }
  /** 이 규칙이 다루지 않는 파일(이미지·알 수 없는 형식)이다. 기존 이미지 드롭 경로가 이어서 판단한다. */
  | { readonly kind: "none" };

const PSD_EXTENSION = /\.psd$/iu;
const INTERCHANGE_EXTENSION = /\.(?:ora|cbz|will)$/iu;
const BRUSH_PACK_EXTENSION = /\.(?:abr|myb|kpp|sut|sutg|bundle)$/iu;
const PROJECT_BACKUP_EXTENSION = /\.(?:toonstudio|json|zip)$/iu;

const COPY_SCOPE = "StudioCanvasDropImport";

/** 사용자 문구는 호출 시점의 언어로 고른다(모듈 로드 시점에 굳히면 언어를 바꿔도 그대로 남는다). */
export const studioCanvasDropProjectBackupGuide = (): string => translateBilingualPair(
  COPY_SCOPE,
  "프로젝트 백업 파일은 끌어 놓아 열지 않아요. 프로젝트 센터의 '복구 (.json)' 또는 '아카이브 복구'에서 열어 주세요.",
  "Project backups are not opened by dropping. Use Restore (.json) or Restore archive in the Project Center.",
);

export const studioCanvasDropUnsupportedMessage = (): string => translateBilingualPair(
  COPY_SCOPE,
  "이 파일은 캔버스에 놓을 수 없어요. PNG·JPEG·WebP·GIF·BMP·TGA·PPM·PAM·QOI·TIFF 이미지, PSD·ORA·CBZ·WILL 문서, 브러시 팩(.abr·.myb·.kpp·.sut·.sutg·.bundle)을 놓아 주세요.",
  "This file can't be dropped on the canvas. Drop an image (PNG, JPEG, WebP, GIF, BMP, TGA, PPM, PAM, QOI, TIFF), a PSD, ORA, CBZ or WILL document, or a brush pack (.abr, .myb, .kpp, .sut, .sutg, .bundle).",
);

function targetForFileName(name: string): StudioCanvasDropImportTarget | null {
  if (PSD_EXTENSION.test(name)) return "psd";
  if (INTERCHANGE_EXTENSION.test(name)) return "interchange";
  if (BRUSH_PACK_EXTENSION.test(name)) return "brush-pack";
  return null;
}

/**
 * 놓은 파일 목록에서 가져오기 흐름으로 보낼 파일을 하나 고른다(한 번에 한 파일).
 * 이미지와 섞여 있어도 작업 파일을 우선한다 — 일부 브라우저가 PSD에 `image/…` 형식을 붙이기 때문에
 * 형식이 아니라 확장자로 판단한다.
 */
export function planStudioCanvasFileDrop<TFile extends Pick<File, "name">>(
  files: readonly TFile[],
): StudioCanvasFileDropPlan<TFile> {
  for (const file of files) {
    const target = targetForFileName(file.name);
    if (target) return { kind: "import", target, file };
  }
  if (files.some((file) => PROJECT_BACKUP_EXTENSION.test(file.name))) {
    return { kind: "guide", message: studioCanvasDropProjectBackupGuide() };
  }
  return { kind: "none" };
}

/** 끌어 오는 동안(파일 이름은 보이지 않는다) 작업 파일일 수 있는 형식 표시. */
const DOCUMENT_TRANSFER_TYPES: ReadonlySet<string> = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.comicbook+zip",
  "application/vnd.toonstudio.will-v1-bounded+zip",
  "application/x-photoshop",
  "application/octet-stream",
  "image/vnd.adobe.photoshop",
]);

interface StudioCanvasTransferItemLike {
  readonly kind?: string;
  readonly type?: string;
}

/**
 * dragover 에서 "놓아도 되는 파일"로 볼지. 브라우저는 끄는 동안 이름을 숨기므로 형식만 본다.
 * 이미지·형식 미상(빈 문자열)은 기존 규칙(`studioTransferCanInsert`)이 이미 받아 주고, 이 함수는
 * 거기서 빠지는 작업 파일 형식(zip 계열·PSD·옥텟 스트림)만 보탠다.
 */
export function studioTransferMayCarryCanvasDocument(
  items: ArrayLike<StudioCanvasTransferItemLike> | null | undefined,
): boolean {
  if (!items) return false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item?.kind === "file" && DOCUMENT_TRANSFER_TYPES.has((item.type ?? "").toLowerCase())) return true;
  }
  return false;
}

export type StudioCanvasDropImportPlan = Extract<StudioCanvasFileDropPlan, { readonly kind: "import" }>;

/** 가져오기 핸들러 — 프로젝트 센터의 파일 선택 입력창이 쓰는 것과 같은 함수를 그대로 받는다. */
export interface StudioCanvasDropImportHandlers {
  readonly psd: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly interchange: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly brushPack: (event: ChangeEvent<HTMLInputElement>) => unknown;
}

export interface StudioCanvasDropImportContext {
  /** 공동 편집 잠금 등으로 문서를 바꿀 수 없는 상태. 브러시 팩은 문서가 아니라 라이브러리에 들어가므로 영향이 없다. */
  readonly documentLocked: boolean;
  readonly lockMessage: () => string;
  /** PSD·문서 보관 파일 검사 중이거나 다른 문서 가져오기가 진행 중이다. */
  readonly documentImportBusy: boolean;
  readonly brushPackBusy: boolean;
  readonly setError: (message: string | null) => void;
}

export const studioCanvasDropImportBusyMessage = (): string => translateBilingualPair(
  COPY_SCOPE,
  "다른 가져오기가 진행 중이에요. 끝난 뒤 다시 놓아 주세요.",
  "Another import is in progress. Drop the file again once it finishes.",
);
export const studioCanvasDropImportStartFailure = (): string => translateBilingualPair(
  COPY_SCOPE,
  "파일 가져오기를 시작하지 못했어요.",
  "Couldn't start importing the file.",
);

/**
 * 캔버스에 놓은 작업 파일을 프로젝트 센터의 파일 선택과 같은 핸들러로 넘긴다.
 * 잠금·진행 중 상태는 입력창이 `disabled`로 막던 조건을 그대로 따라, 놓았는데 아무 반응이 없는 일이 없게
 * 이유를 오류 줄로 알린다. 읽기·검사·손실 미리보기·적용 확인은 핸들러 몫이다.
 */
export function runStudioCanvasDropImport(
  plan: StudioCanvasDropImportPlan,
  handlers: StudioCanvasDropImportHandlers,
  context: StudioCanvasDropImportContext,
): void {
  if (plan.target !== "brush-pack" && context.documentLocked) {
    context.setError(context.lockMessage());
    return;
  }
  if (plan.target === "brush-pack" ? context.brushPackBusy : context.documentImportBusy) {
    context.setError(studioCanvasDropImportBusyMessage());
    return;
  }
  context.setError(null);
  const handler = plan.target === "psd" ? handlers.psd : plan.target === "interchange" ? handlers.interchange : handlers.brushPack;
  const fail = (cause: unknown): void => {
    context.setError(cause instanceof Error && cause.message ? cause.message : studioCanvasDropImportStartFailure());
  };
  try {
    void Promise.resolve(handler(createStudioFileChangeEvent(plan.file))).catch(fail);
  } catch (cause) {
    fail(cause);
  }
}

/**
 * 놓은 파일이 작업 파일이면 가져오기로 넘기고(`importDocument`) 프로젝트 백업이면 안내만 보인다.
 * 이 규칙이 다루지 않는 파일(이미지·알 수 없는 형식)이면 false 를 돌려 기존 이미지 드롭 경로가 이어서 판단하게 한다.
 */
export function dispatchStudioCanvasFileDrop(
  files: readonly File[],
  importDocument: (plan: StudioCanvasDropImportPlan) => void,
  setError: (message: string | null) => void,
): boolean {
  const plan = planStudioCanvasFileDrop(files);
  if (plan.kind === "import") importDocument(plan);
  else if (plan.kind === "guide") setError(plan.message);
  return plan.kind !== "none";
}

/** 놓을 자리를 알리는 표시(동그라미·안내 줄)를 지운다. 표시는 캔버스 뷰포트의 data 속성과 CSS 변수로만 그린다. */
export function clearStudioDropIndicator(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  delete target.dataset.studioAssetDropActive;
  target.style.removeProperty("--studio-asset-drop-x");
  target.style.removeProperty("--studio-asset-drop-y");
}

/**
 * 캔버스 위 dragover: 놓을 수 있는 항목이면 복사 커서와 놓을 자리 표시를 켜고, 파일이지만 받을 수 없는 형식이면
 * 금지 커서를 보인다. PSD·ORA·CBZ 같은 작업 파일도 놓을 수 있어서 이미지가 아닌 형식의 파일 끌기도 받아 준다.
 */
export function handleStudioCanvasDragOver(e: DragEvent): void {
  const canInsert = studioTransferCanInsert(e.dataTransfer)
    || studioTransferMayCarryCanvasDocument(e.dataTransfer.items);
  if (!canInsert && !studioTransferHasFiles(e.dataTransfer)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = canInsert ? "copy" : "none";
  const target = e.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  if (!canInsert) {
    clearStudioDropIndicator(target);
    return;
  }
  const rect = target.getBoundingClientRect();
  target.dataset.studioAssetDropActive = "true";
  target.style.setProperty("--studio-asset-drop-x", `${e.clientX - rect.left + target.scrollLeft}px`);
  target.style.setProperty("--studio-asset-drop-y", `${e.clientY - rect.top + target.scrollTop}px`);
}

/** 끌기가 캔버스 밖으로 나가면(자식 요소로 옮겨 가는 경우는 제외) 놓을 자리 표시를 끈다. */
export function handleStudioCanvasDragLeave(e: DragEvent): void {
  const nextTarget = e.relatedTarget;
  if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) return;
  clearStudioDropIndicator(e.currentTarget);
}
