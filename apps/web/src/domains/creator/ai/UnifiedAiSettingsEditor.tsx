import { CheckCircle2, KeyRound, Loader2, Server, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import {
  clearUnifiedAiSecrets,
  DEFAULT_OPENAI_COMPATIBLE_SETTINGS,
  getUnifiedAiAuxSettings,
  saveOpenAiCompatibleSettings,
  saveUnifiedAiAuxSettings,
  testCreatorRuntime,
  useUnifiedAiAuxSettings,
  type OpenAiCompatibleSettings,
} from "@/shared/ai/unified-ai-settings";

import { testAiConnection, type StudioAiSettings } from "./studio-ai-client";

const INPUT = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/50";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-raised disabled:opacity-50";

type TestState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export function UnifiedAiSettingsEditor({
  studioSettings,
  onStudioSettingsChange,
  compact = false,
}: {
  readonly studioSettings: StudioAiSettings;
  readonly onStudioSettingsChange: (next: StudioAiSettings) => void;
  readonly compact?: boolean;
}) {
  const aux = useUnifiedAiAuxSettings();
  const [showSecrets, setShowSecrets] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  const patchStudio = (patch: Partial<StudioAiSettings>) => {
    const next = { ...studioSettings, ...patch };
    onStudioSettingsChange(next);
    try {
      saveOpenAiCompatibleSettings(next as OpenAiCompatibleSettings);
    } catch {
      // Keep controlled in-memory values visible; validation feedback appears on test.
    }
  };

  const patchAux = (patch: Partial<typeof aux.settings>) => {
    try {
      saveUnifiedAiAuxSettings({ ...getUnifiedAiAuxSettings(), ...patch });
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      });
    }
  };

  const testText = async () => {
    setTestState({ status: "busy" });
    const result = await testAiConnection(studioSettings);
    setTestState(
      result.ok
        ? { status: "ok", message: `사용자 키로 연결됨 · ${result.data.latencyMs}ms` }
        : { status: "error", message: result.error },
    );
  };

  const testRuntime = async () => {
    setTestState({ status: "busy" });
    const result = await testCreatorRuntime();
    setTestState({ status: result.ok ? "ok" : "error", message: result.message });
  };

  const clearAll = () => {
    clearUnifiedAiSecrets();
    onStudioSettingsChange({ ...DEFAULT_OPENAI_COMPATIBLE_SETTINGS } as StudioAiSettings);
    setTestState({ status: "idle" });
  };

  return (
    <div
      className="grid gap-4 rounded-xl border border-line bg-panel/50 p-3"
      data-unified-ai-settings="true"
    >
      <header>
        <div className="flex items-center gap-2 text-sm font-black text-fg">
          <KeyRound size={16} aria-hidden /> 통합 AI 설정
        </div>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          텍스트·이미지·3D·영상/3D 변환 키를 이곳에서만 관리합니다. 모든 비밀 값은 현재 탭의
          sessionStorage에만 있고 앱 서버의 키로 자동 전환하지 않습니다.
        </p>
      </header>

      <section className="grid gap-2" aria-labelledby="compatible-ai-heading">
        <h3 id="compatible-ai-heading" className="text-xs font-black text-fg">
          OpenAI 호환 텍스트·이미지
        </h3>
        <label className="grid gap-1 text-xs text-fg-2">
          API baseURL
          <input
            className={INPUT}
            value={studioSettings.baseUrl}
            onChange={(event) => patchStudio({ baseUrl: event.target.value, apiKey: "" })}
            spellCheck={false}
          />
        </label>
        <label className="grid gap-1 text-xs text-fg-2">
          사용자 API 키
          <input
            className={INPUT}
            type={showSecrets ? "text" : "password"}
            value={studioSettings.apiKey}
            onChange={(event) => patchStudio({ apiKey: event.target.value.slice(0, 4096) })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-fg-2">
            텍스트 모델
            <input
              className={INPUT}
              value={studioSettings.textModel}
              onChange={(event) => patchStudio({ textModel: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs text-fg-2">
            이미지 모델
            <input
              className={INPUT}
              value={studioSettings.imageModel}
              onChange={(event) => patchStudio({ imageModel: event.target.value })}
            />
          </label>
        </div>
        {!compact ? (
          <details className="rounded-lg border border-line bg-card/50 p-2 text-xs text-fg-2">
            <summary className="flex min-h-11 cursor-pointer items-center font-bold">
              호환 API 경로
            </summary>
            <div className="grid gap-2">
              <label className="grid gap-1">
                Chat Completions
                <input
                  className={INPUT}
                  value={studioSettings.chatCompletionsPath}
                  onChange={(event) => patchStudio({ chatCompletionsPath: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                Image Generations
                <input
                  className={INPUT}
                  value={studioSettings.imageGenerationPath}
                  onChange={(event) => patchStudio({ imageGenerationPath: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                Image Edits
                <input
                  className={INPUT}
                  value={studioSettings.imageEditPath}
                  onChange={(event) => patchStudio({ imageEditPath: event.target.value })}
                />
              </label>
            </div>
          </details>
        ) : null}
      </section>

      <section
        className="grid gap-2 border-t border-line pt-3"
        aria-labelledby="three-d-ai-heading"
      >
        <h3 id="three-d-ai-heading" className="text-xs font-black text-fg">
          Hyper3D / Rodin
        </h3>
        <label className="grid gap-1 text-xs text-fg-2">
          사용자 API 키
          <input
            className={INPUT}
            type={showSecrets ? "text" : "password"}
            value={aux.settings.hyper3dApiKey}
            onChange={(event) => patchAux({ hyper3dApiKey: event.target.value.slice(0, 4096) })}
            autoComplete="off"
          />
        </label>
      </section>

      {!compact ? (
        <section
          className="grid gap-2 border-t border-line pt-3"
          aria-labelledby="runtime-heading"
        >
          <h3 id="runtime-heading" className="flex items-center gap-2 text-xs font-black text-fg">
            <Server size={14} aria-hidden /> 개인 Creator Runtime
          </h3>
          <p className="text-xs leading-5 text-fg-3">
            영상·2D↔3D 변환은 사용자가 운영하는 Creator Runtime으로 브라우저가 직접 요청합니다.
            GPU·모델·스토리지 비용은 해당 서버 소유자에게만 발생합니다.
          </p>
          <label className="grid gap-1 text-xs text-fg-2">
            Runtime 주소
            <input
              className={INPUT}
              value={aux.settings.creatorRuntimeBaseUrl}
              onChange={(event) =>
                patchAux({ creatorRuntimeBaseUrl: event.target.value, creatorRuntimeToken: "" })
              }
              placeholder="https://my-runtime.example.com"
            />
          </label>
          <label className="grid gap-1 text-xs text-fg-2">
            Runtime 토큰
            <input
              className={INPUT}
              type={showSecrets ? "text" : "password"}
              value={aux.settings.creatorRuntimeToken}
              onChange={(event) => patchAux({ creatorRuntimeToken: event.target.value.slice(0, 4096) })}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1 text-xs text-fg-2">
            작업 소유자 ID
            <input
              className={INPUT}
              value={aux.settings.creatorRuntimeOwner}
              onChange={(event) => patchAux({ creatorRuntimeOwner: event.target.value.slice(0, 128) })}
            />
          </label>
          <button
            type="button"
            className={BUTTON}
            onClick={() => void testRuntime()}
            disabled={testState.status === "busy"}
          >
            <Server size={14} aria-hidden /> 개인 서버 연결 확인
          </button>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setShowSecrets((value) => !value)}
        >
          {showSecrets ? "비밀 값 숨기기" : "비밀 값 보기"}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => void testText()}
          disabled={testState.status === "busy"}
        >
          {testState.status === "busy" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 size={14} aria-hidden />
          )}
          사용자 키 연결 테스트
        </button>
        <button type="button" className={`${BUTTON} text-bad`} onClick={clearAll}>
          <Trash2 size={14} aria-hidden /> 현재 탭의 모든 키 삭제
        </button>
      </div>
      <p className="text-[0.68rem] leading-5 text-fg-3">
        <TriangleAlert size={13} className="mr-1 inline" aria-hidden />
        연결 테스트와 생성은 사용자 계정에 소액 비용을 발생시킬 수 있습니다. 자동 재시도·운영측 유료
        폴백은 없습니다.
      </p>
      {testState.status === "ok" ? (
        <p role="status" className="text-xs text-good">{testState.message}</p>
      ) : null}
      {testState.status === "error" ? (
        <p role="alert" className="text-xs text-bad">{testState.message}</p>
      ) : null}
    </div>
  );
}
