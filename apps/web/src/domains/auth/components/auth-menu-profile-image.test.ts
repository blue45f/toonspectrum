import { describe, expect, it } from "vitest";

import { safeAuthProfileImageSrc } from "./auth-menu-profile-image";

describe("safeAuthProfileImageSrc", () => {
  it("accepts validated embedded avatars and web profile images", () => {
    const embeddedPng = "data:image/png;base64,iVBORw0KGgo=";

    expect(safeAuthProfileImageSrc(embeddedPng)).toBe(embeddedPng);
    expect(safeAuthProfileImageSrc("https://cdn.example.com/avatar.webp")).toBe(
      "https://cdn.example.com/avatar.webp",
    );
    expect(safeAuthProfileImageSrc("http://localhost:3000/avatar.png")).toBe(
      "http://localhost:3000/avatar.png",
    );
  });

  it("rejects empty, relative and executable profile-image sources", () => {
    expect(safeAuthProfileImageSrc(null)).toBeNull();
    expect(safeAuthProfileImageSrc(undefined)).toBeNull();
    expect(safeAuthProfileImageSrc("/avatar.png")).toBeNull();
    expect(safeAuthProfileImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeAuthProfileImageSrc("file:///tmp/avatar.png")).toBeNull();
    expect(safeAuthProfileImageSrc("data:image/svg+xml;base64,PHN2Zy8+")).toBeNull();
  });
});
