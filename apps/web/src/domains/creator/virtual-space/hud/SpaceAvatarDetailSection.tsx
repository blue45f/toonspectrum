import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualAvatarCustomizer } from "./space-lazy-panels";

/**
 * 꾸미기 탭의 '아바타 세부 꾸미기'(main의 StudioVirtualAvatarCustomizer).
 * 펼칠 때만 모듈을 내려받고, 지금은 이 기기에 저장되는 미리보기임을 요약 줄에서도 밝힌다.
 */
export function SpaceAvatarDetailSection({ identity }: { readonly identity: string }) {
  const bt = useBilingual("SpaceAvatarDetailSection");
  const [open, setOpen] = useState(false);
  return <details className="space-panel-section space-avatar-detail" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <span>{bt("아바타 세부 꾸미기", "Avatar details")}</span>
      <small>{bt("피부·헤어·의상·액세서리 · 미리보기", "Skin, hair, outfit, accessory · preview")}</small>
    </summary>
    {open ? <StudioVirtualAvatarCustomizer identity={identity} /> : null}
  </details>;
}
