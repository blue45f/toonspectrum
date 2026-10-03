import { describe, expect, it } from "vitest";

import {
  STUDIO_INTERACT_KEY_ALIAS,
  STUDIO_INTERACT_KEY_LABEL,
  STUDIO_INTERACT_KEY_SHORTCUTS,
  studioInteractKeycapTextureKey,
  studioInteractPromptDescriptor,
} from "./studio-virtual-space-interact-prompt";

describe("상호작용 프롬프트 키 표준", () => {
  it("표시 키는 E 하나로 통일하고 X는 별칭으로만 남긴다", () => {
    expect(STUDIO_INTERACT_KEY_LABEL).toBe("E");
    expect(STUDIO_INTERACT_KEY_ALIAS).toBe("X");
    expect(STUDIO_INTERACT_KEY_SHORTCUTS).toBe("E X");
    expect(studioInteractPromptDescriptor()).toEqual({ keyLabel: "E", keyShortcuts: "E X" });
  });

  it("키캡 텍스처 캐시 키는 표시 키와 색으로 정해진다", () => {
    expect(studioInteractKeycapTextureKey(0xffffff, 0x111111, 0x22cc88)).toBe("campus-keycap-e-ffffff-111111-22cc88");
    expect(studioInteractKeycapTextureKey(0xffffff, 0x111111, 0x22cc88))
      .not.toBe(studioInteractKeycapTextureKey(0x000000, 0x111111, 0x22cc88));
  });
});
