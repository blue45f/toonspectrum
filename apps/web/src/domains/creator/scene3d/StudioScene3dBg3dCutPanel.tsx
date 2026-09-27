"use no memo";

import { useEffect, useReducer } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioScene3dCutPanel } from "./StudioScene3dCutPanel";
import { StudioScene3dCutSession } from "./studio-scene3d-cut-session";
import {
  createStudioScene3dCutBg3dHost,
  isStudioScene3dCutBg3dHost,
  studioScene3dCutProjectId,
} from "./studio-scene3d-cut-bg3d-host";
import { getStudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

const sessions = new WeakMap<
  object,
  {
    id: string;
    generation: number;
    assetSession: unknown;
    session: StudioScene3dCutSession;
  }
>();
/** 기존 가변 host bag을 그대로 사용하여 간편/전문가 모드가 같은 컷 세션을 공유한다. */
export function StudioScene3dBg3dCutPanel({
  host,
}: {
  readonly host: unknown;
}) {
  const t = useBilingual("scene3d-cut-versions");
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = setInterval(refresh, 300);
    return () => clearInterval(timer);
  }, []);
  if (!isStudioScene3dCutBg3dHost(host)) return null;
  const id = studioScene3dCutProjectId(host);
  let cached = sessions.get(host);
  if (
    !cached ||
    cached.id !== id ||
    cached.assetSession !== host.modalAssetSessionRef?.current
  ) {
    cached?.session.dispose();
    cached = {
      id,
      generation: (cached?.generation ?? 0) + 1,
      assetSession: host.modalAssetSessionRef?.current,
      session: new StudioScene3dCutSession(
        createStudioScene3dCutBg3dHost(host),
        getStudioWebAuthoringProjectV3Repository()
      ),
    };
    sessions.set(host, cached);
  }
  if (host.isRestoringScene || host.modelRenderer == null)
    return (
      <p role="status" className="p-3 text-xs text-fg-2">
        {t(
          "장면과 렌더러가 준비되면 컷 패널을 엽니다.",
          "The cut panel opens when the scene and renderer are ready."
        )}
      </p>
    );
  return (
    <StudioScene3dCutPanel
      key={`${id}:${cached.generation}`}
      session={cached.session}
    />
  );
}
