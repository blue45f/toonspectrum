import { describe, expect, it } from "vitest";

import { CLOUD_STORAGE_PROVIDERS, CloudStorageService } from "./cloud-storage-adapter";

describe("Cloud Storage Adapter", () => {
  it("defines support for Google Drive, Naver MYBOX, and OneDrive", () => {
    expect(Object.keys(CLOUD_STORAGE_PROVIDERS)).toEqual(["google-drive", "naver-mybox", "onedrive"]);
    expect(CLOUD_STORAGE_PROVIDERS["google-drive"].name).toBe("Google Drive");
    expect(CLOUD_STORAGE_PROVIDERS["naver-mybox"].name).toBe("네이버 MYBOX");
    expect(CLOUD_STORAGE_PROVIDERS["onedrive"].name).toBe("Microsoft OneDrive");
  });

  it("handles OAuth authorization and file listing gracefully", async () => {
    const service = new CloudStorageService();
    const auth = await service.authorize("google-drive");
    expect(auth.accessToken).toContain("google-drive");

    const files = await service.listFiles("naver-mybox");
    expect(files.length).toBeGreaterThan(0);
    expect(files[0].provider).toBe("naver-mybox");

    const blob = new Blob(["mock content"], { type: "text/plain" });
    const uploaded = await service.exportFileToCloud("onedrive", "test.toon", blob);
    expect(uploaded.fileId).toContain("onedrive-saved");
  });
});
