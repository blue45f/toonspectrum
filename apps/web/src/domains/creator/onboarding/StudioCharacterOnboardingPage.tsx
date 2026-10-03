import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { PageIntro } from "@/shared/components/page-intro";
import "../studio-3d-ui/studio-3d-illustrated-chrome.css";
import { safeCharacterOnboardingDestination } from "./studio-character-onboarding-destination";
import { StudioVirtualSpaceEntryLobby } from "../virtual-space/StudioVirtualSpaceEntryLobby";
import {
  readStudioVirtualArtStyle,
  writeStudioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
} from "../virtual-space/studio-virtual-space-art-style";
import {
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceEntryPreference,
  validStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceEntryPreference,
} from "../virtual-space/studio-virtual-space-entry-preference";

export function StudioCharacterOnboardingPage() {
  const bt = useBilingual("StudioCharacterOnboardingPage");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeCharacterOnboardingDestination(params.get("next"));
  const initialPreference = useMemo(() => readStudioVirtualSpaceEntryPreference(), []);
  const [avatarIndex, setAvatarIndex] = useState(
    initialPreference.confirmed && validStudioVirtualSpaceAvatarIndex(initialPreference.avatarIndex)
      ? initialPreference.avatarIndex
      : -1,
  );
  const [artStyle, setArtStyle] = useState<StudioVirtualArtStyleKey>(() => readStudioVirtualArtStyle());
  const [nickname, setNickname] = useState(initialPreference.nickname || "");
  const [saveFailed, setSaveFailed] = useState(false);

  return <div className="studio-character-onboarding"><PageIntro variant="unfold"><StudioVirtualSpaceEntryLobby
    avatarIndex={avatarIndex}
    artStyle={artStyle}
    nickname={nickname}
    returning={initialPreference.confirmed}
    projectName={bt("나의 창작 홈", "My creative home")}
    variant="character-onboarding"
    backHref="/home"
    onAvatarIndex={setAvatarIndex}
    onArtStyle={setArtStyle}
    onNickname={setNickname}
    onEnter={() => {
      const resolvedNickname = normalizeStudioVirtualSpaceNickname(nickname);
      if (!validStudioVirtualSpaceAvatarIndex(avatarIndex) || !resolvedNickname) return;
      setNickname(resolvedNickname);
      const saved = writeStudioVirtualSpaceEntryPreference(avatarIndex, resolvedNickname);
      void writeStudioVirtualArtStyle(artStyle);
      if (!saved && !saveFailed) {
        // 저장 실패를 조용히 넘기지 않는다. 안내는 한 번만 막고,
        // 다시 누르면 저장이 안 된 채로도 입장할 수 있게 한다.
        setSaveFailed(true);
        return;
      }
      navigate(destination, { replace: true });
    }}
  /></PageIntro>{saveFailed ? (
    <p
      role="status"
      className="mx-auto mt-4 w-fit max-w-xl rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-center text-sm leading-6 text-fg"
    >
      {bt(
        "이 브라우저에 입장 설정을 저장하지 못했어요. 그대로 입장하면 다음 방문 때 다시 설정해야 할 수 있어요. 입장 버튼을 한 번 더 누르면 계속 진행합니다.",
        "Your entry settings could not be saved in this browser. If you continue, you may need to set them up again on your next visit. Press the enter button once more to continue.",
      )}
    </p>
  ) : null}</div>;
}

export default StudioCharacterOnboardingPage;
