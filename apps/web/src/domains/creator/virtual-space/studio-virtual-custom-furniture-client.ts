import { STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES } from "@toonstudio/contracts/studio-virtual-custom-furniture-contract";

import { apiFetch } from "@/platform/api";

/**
 * 사용자가 올린 가구 목록과 서명 읽기 URL을 다룬다.
 *
 * 로드된 텍스처는 Phaser 씬에 별도 키로 등록한다. 아틀라스 키(furniture/landmark)는
 * 테마별 아틀라스 전체를 가리켜야 하는 계약이 있어 건드릴 수 없다.
 */
export interface StudioVirtualCustomFurniture {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
}

export function studioVirtualCustomFurnitureTextureKey(assetId: string): string {
  // 아틀라스와 겹치지 않는 네임스페이스를 쓴다.
  return `studio-virtual-custom-furniture-${assetId}`;
}

export async function listStudioVirtualCustomFurniture(
  signal?: AbortSignal,
): Promise<readonly StudioVirtualCustomFurniture[]> {
  const response = await apiFetch("/studio/space/furniture", { method: "GET", signal });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  return Array.isArray(body) ? body.filter(isFurniture) : [];
}

function isFurniture(value: unknown): value is StudioVirtualCustomFurniture {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0 && typeof row.name === "string";
}

export type StudioVirtualFurnitureUploadResult =
  | { readonly ok: true; readonly furniture: StudioVirtualCustomFurniture }
  | { readonly ok: false; readonly error: string };

/**
 * 파일을 골라 올린다. 브라우저가 준 Content-Type 은 믿지 않고 실제 바이트로 mime 을
 * 다시 확인한다. 계약이 시그니처를 보기 때문이다. 여기서 값을 속이면 서버가 거절하고,
 * 사용자에게는 이유도 모를 오류만 보인다.
 */
export async function uploadStudioVirtualCustomFurniture(file: File): Promise<StudioVirtualFurnitureUploadResult> {
  if (file.size === 0) return { ok: false, error: "빈 파일은 올릴 수 없어요." };
  if (file.size > STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES) {
    return { ok: false, error: "1MB 이하만 올릴 수 있어요." };
  }

  const declaredMime = await sniffMime(file);
  if (!declaredMime) {
    return { ok: false, error: "PNG 또는 WebP만 올릴 수 있어요." };
  }

  const dataBase64 = await toBase64(file);

  const response = await apiFetch("/studio/space/furniture", {
    method: "POST",
    body: JSON.stringify({ declaredMime, name: file.name.replace(/\.[a-z0-9]+$/iu, ""), dataBase64 }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" ? (body as { message?: unknown }).message : null;
    return { ok: false, error: typeof message === "string" ? message : "가구를 올리지 못했어요." };
  }
  if (!body || !isFurniture(body)) return { ok: false, error: "서가 응답을 이해하지 못했어요." };
  return { ok: true, furniture: body };
}

async function sniffMime(file: File): Promise<"image/png" | "image/webp" | null> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => head[index] === byte)) return "image/png";
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (riff.every((byte, index) => head[index] === byte) && webp.every((byte, index) => head[8 + index] === byte)) {
    return "image/webp";
  }
  return null;
}

async function toBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // 한 번에 큰 문자열로 몰지 않는다. 파일이 크면 인자를 통째로 넘기지 못한다.
  for (let offset = 0; offset < buffer.length; offset += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function createStudioVirtualFurnitureReadUrl(assetId: string): Promise<string | null> {
  const response = await apiFetch(
    `/studio/space/furniture/${encodeURIComponent(assetId)}/read-url`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body && typeof body === "object" && typeof (body as { url?: unknown }).url === "string"
    ? (body as { url: string }).url
    : null;
}
