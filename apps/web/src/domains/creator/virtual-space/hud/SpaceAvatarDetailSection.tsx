import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioLpcCreditsNotice } from "../lpc/StudioLpcCreditsNotice";
import { StudioVirtualAvatarCustomizer } from "./space-lazy-panels";

/**
 * 꾸미기 탭의 캐릭터 아래 영역.
 * - '아바타 세부 꾸미기'(main의 StudioVirtualAvatarCustomizer): 펼칠 때만 모듈을 내려받고, 지금은 이 기기에 저장되는 미리보기임을 요약 줄에서도 밝힌다.
 * - 캐릭터 아트 출처·라이선스: LPC 픽셀 캐릭터를 고르는 바로 이 자리에서 작가와 라이선스(OGA-BY 3.0 표기 의무)를 볼 수 있게 한다.
 */
export function SpaceAvatarDetailSection({ identity }: { readonly identity: string }) {
  const bt = useBilingual("SpaceAvatarDetailSection");
  const [open, setOpen] = useState(false);
  // 패널 안 흐름에는 형제 사이 간격이 없어서, 두 접힘 영역이 붙어 보이지 않게 이 묶음에서 간격을 둔다.
  return <div className="grid gap-2.5">
    <details className="space-panel-section space-avatar-detail" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>{bt("아바타 세부 꾸미기", "Avatar details")}</span>
        <small>{bt("피부·헤어·의상·액세서리 · 미리보기", "Skin, hair, outfit, accessory · preview")}</small>
      </summary>
      {open ? <StudioVirtualAvatarCustomizer identity={identity} /> : null}
    </details>
    <StudioLpcCreditsNotice />
  </div>;
}
