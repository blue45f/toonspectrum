// ONNX Runtime Web PoC — u2netp (U-2-Net 경량판) 전경 분리 실측
// 실행: node onnx-poc/poc-u2netp.mjs  (worktree 루트에서, node_modules 심링크 사용)
// 환경: Node + onnxruntime-web 1.27.0, WASM EP (브라우저 WebGPU는 이 VM에서 측정 불가)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const ort = require("onnxruntime-web");

const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// 합성 입력: 어두운 배경 위에 밝은 원반 (비인물 피사체) — selfie 계열이 못 잡는 대상의 대리 시험
function syntheticRgba() {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  const cx = SIZE / 2, cy = SIZE / 2, r = 90;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      rgba[i] = inside ? 232 : 24;
      rgba[i + 1] = inside ? 198 : 28;
      rgba[i + 2] = inside ? 160 : 38;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// U-2-Net 전처리 계약 (rembg/photon 문서화): 채널 최대값으로 나누고 ImageNet mean/std 정규화, NCHW
function preprocess(rgba) {
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c += 1) max = Math.max(max, rgba[i + c]);
  }
  const divisor = max === 0 ? 1 : max;
  const data = new Float32Array(3 * SIZE * SIZE);
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    for (let c = 0; c < 3; c += 1) {
      const v = rgba[p * 4 + c] / divisor;
      data[c * SIZE * SIZE + p] = (v - MEAN[c]) / STD[c];
    }
  }
  return data;
}

function cpuMs(fn) {
  const start = process.cpuUsage();
  const t0 = performance.now();
  return fn().then((value) => {
    const cpu = process.cpuUsage(start);
    return { value, cpuMs: (cpu.user + cpu.system) / 1000, wallMs: performance.now() - t0 };
  });
}

const modelBytes = readFileSync(new URL("./u2netp.onnx", import.meta.url));
console.log(`model bytes: ${modelBytes.byteLength}`);

const session = await ort.InferenceSession.create(modelBytes, {
  executionProviders: ["wasm"],
  graphOptimizationLevel: "all",
});
console.log("inputs:", session.inputNames);
console.log("outputs:", session.outputNames);

const input = preprocess(syntheticRgba());
const feed = {
  [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]),
};

// 워밍업 2회 후 CPU 시간 기준 10회 측정 (WASM 검토와 같은 방식: 벽시계는 VM 부하 노이즈가 큼)
for (let i = 0; i < 2; i += 1) await session.run(feed);
const runs = [];
let lastOut = null;
for (let i = 0; i < 10; i += 1) {
  const r = await cpuMs(() => session.run(feed));
  runs.push(r.cpuMs);
  lastOut = r.value;
}
runs.sort((a, b) => a - b);
console.log(`infer CPU ms (n=10): min=${runs[0].toFixed(1)} median=${runs[5].toFixed(1)} max=${runs[9].toFixed(1)}`);

const outName = session.outputNames[0];
const out = lastOut[outName];
console.log(`output[0] "${outName}": dims=${out.dims} type=${out.type}`);
const mask = out.data;
// 후처리 계약: min/max 정규화 후 원반 안/밖 평균 비교
let min = Infinity, max = -Infinity;
for (const v of mask) { if (v < min) min = v; if (v > max) max = v; }
let inSum = 0, inN = 0, outSum = 0, outN = 0;
const cx = SIZE / 2, cy = SIZE / 2;
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const v = (mask[y * SIZE + x] - min) / (max - min);
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 <= 70 * 70) { inSum += v; inN += 1; }
    else if (d2 >= 120 * 120) { outSum += v; outN += 1; }
  }
}
console.log(`mask response: inside-disc mean=${(inSum / inN).toFixed(3)} outside mean=${(outSum / outN).toFixed(3)} (min=${min.toFixed(3)} max=${max.toFixed(3)})`);
await session.release();
