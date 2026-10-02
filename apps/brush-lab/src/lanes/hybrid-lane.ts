import { MAX_TILES_PER_DAB } from "../engine/gpu/layout";
import { SumiKernelSession } from "../engine/wasm/kernel-session";

import { loadWasmKernelForEnv, wasmReasonOf } from "./wasm-cpu-lane";
import { createGpuComputeLane } from "./webgpu-compute-lane";

import type { LaneDescriptor } from "./lane";
import type { GpuComputeLaneVariant, WebgpuComputeLane } from "./webgpu-compute-lane";

/**
 * wasm-gpu-hybrid 레인: **CSR 비닝은 wasm 커널(CPU), 래스터·습식·합성은 WebGPU compute**.
 * `webgpu-compute` 레인과 같은 StrokePipeline·SumiComputeRuntime을 쓰되, 프레임마다 GPU의 count_main·scan_blocks·
 * scan_block_sums·scatter_stable 4패스를 건너뛰고 wasm `sk_bin_dabs`가 만든 CSR(counts·offsets·refs)을 `queue.writeBuffer`로
 * 올린다. GPU는 `scan_add`(dirty 목록·획 슬롯·습식 활성화)·`write_indirect`·`raster_tile`·습식 스텝·`composite_dirty`를 그대로 돌린다
 * (dispatch 수 프레임당 8 → 4 + 습식). refs는 안정 scatter와 같은 순서(타일 안 dab 인덱스 오름차순)라 결과 픽셀은 같다.
 *
 * 스펙의 "wasm이 StrokePipeline(동역학·dab 배치) 역할" 안은 구현하지 않았다: 입력 파이프라인·물리·방출기는 TS뿐이고 Rust 이식은
 * f32 패리티 위험(libm 차이가 dab 위치를 흔든다) 대비 이득이 불확실하다. 대신 wasm이 이미 TS와 비트 일치하는 CSR 비닝을 맡는다.
 *
 * 검증: Node에서는 모의 장치로 바인딩·디스패치·업로드 계약을, 브라우저 프로브(SwiftShader)에서 webgpu-compute와 픽셀이 같은지 본다.
 * 실 GPU에서의 이득(CPU 비닝 + 업로드 vs GPU 비닝)은 측정하지 않았다.
 */
export const HYBRID_LANE_ID = "wasm-gpu-hybrid" as const;

export const HYBRID_VARIANT: GpuComputeLaneVariant = {
  id: HYBRID_LANE_ID,
  label: "WASM 비닝 + WebGPU 래스터 하이브리드",
  kind: "candidate",
  status: "browser-verification-required",
  extra: {
    async probe(env) {
      try {
        await loadWasmKernelForEnv(env);
        return [];
      } catch (error) {
        return [wasmReasonOf(error)];
      }
    },
    async create(env) {
      const kernel = await loadWasmKernelForEnv(env);
      const session = new SumiKernelSession(kernel);
      return {
        createBinner(tilesX, tilesY) {
          return (dabs, count) => {
            session.uploadDabs(dabs, count);
            const bin = session.bin(tilesX, tilesY, MAX_TILES_PER_DAB);
            return { counts: bin.counts, offsets: bin.offsets, refs: bin.refs, overflowDabs: bin.overflowDabs };
          };
        },
        dispose() {
          session.dispose();
        },
      };
    },
  },
};

export function createHybridLane(): WebgpuComputeLane {
  return createGpuComputeLane(HYBRID_VARIANT);
}

export const HYBRID_LANE: LaneDescriptor = {
  id: HYBRID_LANE_ID,
  label: HYBRID_VARIANT.label,
  kind: "candidate",
  status: "browser-verification-required",
  nodeVerification: "wasm 로드·INTEGRITY·모의 장치로 비닝 4패스 생략·CSR 업로드·overflow 절대값 기록 계약",
  browserVerification: "SwiftShader 실측: 습식 5종 × fixture 3종 15건·스모크 15종(zigzag)·1024²가 cpu-reference와 δ48 0%·ΔE p99 0이고 webgpu-compute와 픽셀 해시 동일(습식 포함); 실 GPU 미검증(scripts/browser-probe.mjs)",
  create: createHybridLane,
};
