/**
 * Studio Wasm64 (Memory64 64-bit WebAssembly) 메모리 및 대용량 원고 하버너 모듈.
 *
 * Wasm32의 4GB 메모리 한계를 돌파하여 8K×100K 픽셀(16GB+ RGBA 레이어 버퍼) 대형 초장편
 * 웹툰 원고 편집 시 64비트 선형 포인터(i64) 할당 및 메모리 풀을 관리한다.
 */

export interface StudioWasm64CapabilityReport {
  /** Wasm64 (Memory64) 지원 여부. */
  readonly isWasm64Supported: boolean;
  /** SIMD128 지원 여부. */
  readonly isSimdSupported: boolean;
  /** 최대 안심 할당 가능 메모리 용량(GiB). */
  readonly maxAllocatableMemoryGiB: number;
}

/**
 * 런타임 환경의 Wasm64 (Memory64 64비트 메모리) 지원 여부를 비동기 검사한다.
 */
export function checkStudioWasm64Capability(): StudioWasm64CapabilityReport {
  let isWasm64Supported = false;
  let isSimdSupported = false;

  try {
    // Wasm64 (Memory64) 최소 바이트코드 검증
    const memory64Bytecode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x04, 0x01,
    ]);
    if (typeof WebAssembly === "object" && typeof WebAssembly.validate === "function") {
      isWasm64Supported = WebAssembly.validate(memory64Bytecode);
    }
  } catch {
    isWasm64Supported = false;
  }

  try {
    // SIMD128 최소 바이트코드 검증
    const simdBytecode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0xfd, 0x0c, 0x00, 0x0b,
    ]);
    if (typeof WebAssembly === "object" && typeof WebAssembly.validate === "function") {
      isSimdSupported = WebAssembly.validate(simdBytecode);
    }
  } catch {
    isSimdSupported = false;
  }

  const maxAllocatableMemoryGiB = isWasm64Supported ? 64 : 4;

  return Object.freeze({
    isWasm64Supported,
    isSimdSupported,
    maxAllocatableMemoryGiB,
  });
}

export interface StudioWasm64LayerAllocation {
  readonly layerId: string;
  readonly byteSize: number;
  readonly addressI64: bigint;
}

/**
 * 64비트 메모리 맵 포인터 관리자.
 */
export class StudioWasm64MemoryManager {
  private currentPointer: bigint = BigInt(1024 * 1024); // 1MB 릴리즈 시작
  private readonly allocations = new Map<string, StudioWasm64LayerAllocation>();

  /**
   * 레이어용 64비트 포인터 메모리 영역을 할당한다.
   */
  public allocateLayerMemory(layerId: string, byteSize: number): StudioWasm64LayerAllocation {
    const addressI64 = this.currentPointer;
    // 64-bit alignment (64 byte Boundary)
    const alignedSize = BigInt(Math.ceil(byteSize / 64) * 64);
    this.currentPointer += alignedSize;

    const allocation: StudioWasm64LayerAllocation = {
      layerId,
      byteSize,
      addressI64,
    };
    this.allocations.set(layerId, allocation);
    return allocation;
  }

  public getAllocation(layerId: string): StudioWasm64LayerAllocation | null {
    return this.allocations.get(layerId) ?? null;
  }

  public getTotalAllocatedBytes(): number {
    let total = 0;
    for (const item of this.allocations.values()) {
      total += item.byteSize;
    }
    return total;
  }
}
