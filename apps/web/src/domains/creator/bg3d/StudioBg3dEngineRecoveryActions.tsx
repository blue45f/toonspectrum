import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames } from "./studio-bg3d-editor-ui";
import { STUDIO_BG3D_ENGINE_PREFERENCE_LABELS, STUDIO_BG3D_ENGINE_PREFERENCES } from "./studio-bg3d-engine-selection";

import type { StudioBg3dEnginePreference } from "./studio-bg3d-engine-selection";

/** The blocked viewport offers the same explicit choices as the engine panel; never auto-switch. */
export function StudioBg3dEngineRecoveryActions({
  preference,
  onPreferenceChange,
}: {
  readonly preference: StudioBg3dEnginePreference;
  readonly onPreferenceChange: (preference: StudioBg3dEnginePreference) => void;
}) {
  return (
    <div role="group" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEngineRecoveryActions", "ko", "사용할 3D 엔진 직접 선택")} className="mt-3 flex max-w-full flex-wrap justify-center gap-2">
      {STUDIO_BG3D_ENGINE_PREFERENCES.map((engine) => {
        const isCurrent = engine === preference;
        const continueWithWebgl = preference === "webgpu" && engine === "webgl2";
        return (
          <button
            key={engine}
            type="button"
            data-testid={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEngineRecoveryActions", "en", "studio-bg3d-recovery-{v0}"), { v0: String(engine) })}
            data-studio-bg3d-recovery-recommended={continueWithWebgl ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEngineRecoveryActions", "en", "true") : undefined}
            className={studioBg3dClassNames(
              STUDIO_BG3D_CONTROL_BUTTON,
              "min-h-11 min-w-11 border-line px-4",
              continueWithWebgl
                ? "border-accent/70 bg-accent-soft text-accent hover:border-accent hover:brightness-105"
                : "bg-panel text-fg hover:border-accent/60 hover:bg-raised",
            )}
            onClick={() => onPreferenceChange(engine)}
          >
            {continueWithWebgl
              ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEngineRecoveryActions", "ko", "WebGL2로 계속")
              : `${STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[engine]}${isCurrent ? " 다시 시도" : " 선택"}`}
          </button>
        );
      })}
    </div>
  );
}
