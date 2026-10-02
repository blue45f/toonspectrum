/**
 * 렌더 백엔드 식별자. 사용자가 명시 선택하며 자동 전환은 금지한다(ADR-0018).
 */
export const ENGINE_BACKENDS = ["webgpu", "webgl2"] as const;
export type EngineBackend = (typeof ENGINE_BACKENDS)[number];

export const ENGINE_BACKEND_LABELS_KO: Readonly<Record<EngineBackend, string>> = {
  webgpu: "WebGPU",
  webgl2: "WebGL2",
};

const BACKEND_SET: ReadonlySet<string> = new Set(ENGINE_BACKENDS);

export function isEngineBackend(value: string): value is EngineBackend {
  return BACKEND_SET.has(value);
}
