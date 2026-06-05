import { describe, it, expect } from "vitest";
import { normalizeAssetName, createAssetRecord } from "./studio-asset-library";

describe("studio-asset-library pure helpers", () => {
  describe("normalizeAssetName", () => {
    it("should strip common image extensions case-insensitively", () => {
      expect(normalizeAssetName("my-cat.png")).toBe("my-cat");
      expect(normalizeAssetName("sunset.JPEG")).toBe("sunset");
      expect(normalizeAssetName("animation.gif")).toBe("animation");
      expect(normalizeAssetName("vector.svg")).toBe("vector");
      expect(normalizeAssetName("photo.webp")).toBe("photo");
      expect(normalizeAssetName("image.avif")).toBe("image");
    });

    it("should handle names without extensions", () => {
      expect(normalizeAssetName("my-cool-asset")).toBe("my-cool-asset");
    });

    it("should fallback to '내 에셋' if name becomes empty after stripping", () => {
      expect(normalizeAssetName(".png")).toBe("내 에셋");
      expect(normalizeAssetName("   ")).toBe("내 에셋");
    });
  });

  describe("createAssetRecord", () => {
    it("should round dimensions and enforce a minimum of 1", () => {
      const record = createAssetRecord({
        name: "test.png",
        dataUrl: "data:image/png;base64,abc",
        width: 100.4,
        height: 200.6,
      });

      expect(record.name).toBe("test");
      expect(record.dataUrl).toBe("data:image/png;base64,abc");
      expect(record.width).toBe(100);
      expect(record.height).toBe(201);
      expect(record.id).toBeDefined();
      expect(record.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it("should enforce a minimum dimension of 1", () => {
      const record = createAssetRecord({
        name: "test.png",
        dataUrl: "data:image/png;base64,abc",
        width: -5,
        height: 0.1,
      });

      expect(record.width).toBe(1);
      expect(record.height).toBe(1);
    });

    it("should allow overriding id and now", () => {
      const mockId = "custom-id";
      const mockNow = 1234567890;
      const record = createAssetRecord(
        {
          name: "test.png",
          dataUrl: "data:image/png;base64,abc",
          width: 100,
          height: 100,
        },
        mockId,
        mockNow
      );

      expect(record.id).toBe(mockId);
      expect(record.createdAt).toBe(mockNow);
    });
  });
});
