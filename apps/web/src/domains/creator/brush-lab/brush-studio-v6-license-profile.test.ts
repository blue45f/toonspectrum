import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  BRUSH_STUDIO_V6_PROVIDER_MANIFEST,
  brushStudioV6LicenseProfileAllows,
} from "./brush-studio-v6-license-profile";

describe("V6 brush engine license profile", () => {
  it("enables GPL and noncommercial providers only in the declared profiles", () => {
    expect(BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE).toBe("noncommercial-full");
    expect(brushStudioV6LicenseProfileAllows("permissive-only", "permissive")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows("permissive-only", "copyleft")).toBe(false);
    expect(brushStudioV6LicenseProfileAllows("permissive-only", "noncommercial")).toBe(false);
    expect(brushStudioV6LicenseProfileAllows("source-available", "copyleft")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows("source-available", "noncommercial")).toBe(false);
    expect(brushStudioV6LicenseProfileAllows("noncommercial-full", "copyleft")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows("noncommercial-full", "noncommercial")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows("noncommercial-full", "private-grant")).toBe(true);
  });

  it("pins every external engine identity, license and integration state", () => {
    expect(new Set(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.map((entry) => entry.id)).size)
      .toBe(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.length);
    expect(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.find((entry) => entry.id === "mixbox-js-v2"))
      .toMatchObject({ license: "CC-BY-NC-4.0", integration: "connected" });
    expect(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.find((entry) => entry.id === "krita-paintop-gpl"))
      .toMatchObject({ license: "GPL-3.0-or-later", integration: "adapter-ready" });
    expect(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.find((entry) => entry.id === "libmypaint-wasm-v1"))
      .toMatchObject({ license: "ISC", integration: "connected" });
  });
});
