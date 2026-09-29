// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEntryCodeRecord } from "./studio-virtual-space-entry-code";
import { StudioVirtualSpaceInviteSheet } from "./StudioVirtualSpaceInviteSheet";

const RECORD = createEntryCodeRecord({ code: "ABC234", spaceId: "space-1", spaceName: "콘티룸", now: 1000 })!;

function renderSheet() {
  return render(
    <StudioVirtualSpaceInviteSheet
      inviteLink="https://toonstudio.cloud/vspace#invite=token123"
      codeRecord={RECORD}
      spaceUrlBase="https://toonstudio.cloud/vspace"
    />,
  );
}

describe("StudioVirtualSpaceInviteSheet", () => {
  it("링크 탭에 초대 링크를 표시한다", () => {
    renderSheet();
    expect(screen.getByText("https://toonstudio.cloud/vspace#invite=token123")).toBeTruthy();
  });

  it("코드 탭에 6자리 코드를 표시한다", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("tab", { name: "입장코드" }));
    expect(screen.getByLabelText("입장코드").textContent).toContain("ABC234");
  });

  it("QR 탭에서 QR 이미지를 렌더한다", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("tab", { name: "QR" }));
    await waitFor(() => {
      const img = screen.getByAltText(/입장 QR 코드/);
      expect(img.getAttribute("src")?.startsWith("data:image/png;base64,")).toBe(true);
    });
  });
});
