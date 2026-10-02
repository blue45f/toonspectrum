/**
 * TypedArray 유틸: 결합, 행 뒤집기, (un)premultiply, 바이트 뷰.
 * 래스터 규약(contracts/capture.ts): straight alpha, top-down, RGBA8.
 */
export type ByteRaster = Uint8ClampedArray | Uint8Array;

interface TypedArrayLike {
  readonly length: number;
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly buffer: ArrayBufferLike;
}

interface TypedArrayCtor<T extends TypedArrayLike> {
  new (length: number): T;
}

interface SettableArray<T> {
  set(array: ArrayLike<number>, offset?: number): void;
  readonly length: number;
  subarray(begin: number, end?: number): T;
}

/** 같은 종류의 TypedArray들을 하나로 이어 붙인다. */
export function concatTyped<T extends TypedArrayLike & SettableArray<T> & ArrayLike<number>>(
  ctor: TypedArrayCtor<T>,
  arrays: readonly T[],
): T {
  let total = 0;
  for (const array of arrays) total += array.length;
  const out = new ctor(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

export function concatFloat32(arrays: readonly Float32Array[]): Float32Array {
  return concatTyped(Float32Array, arrays);
}

export function concatUint32(arrays: readonly Uint32Array[]): Uint32Array {
  return concatTyped(Uint32Array, arrays);
}

export function concatUint16(arrays: readonly Uint16Array[]): Uint16Array {
  return concatTyped(Uint16Array, arrays);
}

/** 인덱스 배열을 정점 오프셋만큼 밀어 새 배열로 돌려준다(파츠 병합용). */
export function offsetIndices(indices: Uint32Array, offset: number): Uint32Array {
  const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) out[i] = (indices[i] ?? 0) + offset;
  return out;
}

/**
 * 행 순서를 제자리에서 뒤집는다(bottom-up ↔ top-down). channels = 픽셀당 요소 수.
 * 길이가 width*height*channels와 다르면 throw(무음 손상 금지).
 */
export function flipRowsInPlace<T extends { length: number; [index: number]: number }>(
  data: T,
  width: number,
  height: number,
  channels = 4,
): T {
  const rowLength = width * channels;
  if (data.length !== rowLength * height) {
    throw new Error(`flipRowsInPlace: 길이 ${data.length}가 ${width}×${height}×${channels}=${rowLength * height}와 다릅니다.`);
  }
  for (let top = 0, bottom = height - 1; top < bottom; top += 1, bottom -= 1) {
    const topBase = top * rowLength;
    const bottomBase = bottom * rowLength;
    for (let i = 0; i < rowLength; i += 1) {
      const tmp = data[topBase + i] ?? 0;
      data[topBase + i] = data[bottomBase + i] ?? 0;
      data[bottomBase + i] = tmp;
    }
  }
  return data;
}

/** premultiplied RGBA8 → straight(제자리). a=0이면 RGB=0. */
export function unpremultiply<T extends ByteRaster>(rgba: T): T {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] ?? 0;
    if (a === 0) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
    } else if (a < 255) {
      const scale = 255 / a;
      rgba[i] = Math.min(255, Math.round((rgba[i] ?? 0) * scale));
      rgba[i + 1] = Math.min(255, Math.round((rgba[i + 1] ?? 0) * scale));
      rgba[i + 2] = Math.min(255, Math.round((rgba[i + 2] ?? 0) * scale));
    }
  }
  return rgba;
}

/** straight RGBA8 → premultiplied(제자리) */
export function premultiply<T extends ByteRaster>(rgba: T): T {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 0) / 255;
    if (a < 1) {
      rgba[i] = Math.round((rgba[i] ?? 0) * a);
      rgba[i + 1] = Math.round((rgba[i + 1] ?? 0) * a);
      rgba[i + 2] = Math.round((rgba[i + 2] ?? 0) * a);
    }
  }
  return rgba;
}

/** 어떤 TypedArray든 바이트 뷰(복사 없음) */
export function bytesOf(view: TypedArrayLike): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/** 두 숫자 배열이 허용 오차 내에서 같은지 */
export function arraysApproxEqual(a: ArrayLike<number>, b: ArrayLike<number>, eps = 0): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? Number.NaN;
    const y = b[i] ?? Number.NaN;
    if (Number.isNaN(x) || Number.isNaN(y) || Math.abs(x - y) > eps) return false;
  }
  return true;
}

/** 두 바이트 배열이 완전히 같은지 */
export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  return arraysApproxEqual(a, b, 0);
}

/** 평균 절대 오차(0..255 래스터 비교용) */
export function meanAbsoluteError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / a.length;
}
