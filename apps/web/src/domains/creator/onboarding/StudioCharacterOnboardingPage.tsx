import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { safeCharacterOnboardingDestination } from "./studio-character-onboarding-destination";
import { StudioVirtualSpaceEntryLobby } from "../virtual-space/StudioVirtualSpaceEntryLobby";
import {
  readStudioVirtualArtStyle,
  writeStudioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
} from "../virtual-space/studio-virtual-space-art-style";
import {
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

  return <StudioVirtualSpaceEntryLobby
    avatarIndex={avatarIndex}
    artStyle={artStyle}
    returning={initialPreference.confirmed}
    projectName={bt("나의 창작 홈", "My creative home")}
    variant="character-onboarding"
    backHref="/home"
    onAvatarIndex={setAvatarIndex}
    onArtStyle={setArtStyle}
    onEnter={() => {
      if (!validStudioVirtualSpaceAvatarIndex(avatarIndex)) return;
      void writeStudioVirtualSpaceEntryPreference(avatarIndex);
      void writeStudioVirtualArtStyle(artStyle);
      navigate(destination, { replace: true });
    }}
  />;
}

export default StudioCharacterOnboardingPage;
