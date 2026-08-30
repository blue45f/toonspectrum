import { describe, expect, it } from "vitest";

import { shouldLoadApiLocalEnvFile } from "./load-env";

describe("API local environment file policy", () => {
  it("loads local developer files by default", () => {
    expect(shouldLoadApiLocalEnvFile({})).toBe(true);
    expect(shouldLoadApiLocalEnvFile({ API_LOCAL_ENV_FILE_ENABLED: "true" })).toBe(true);
  });

  it("lets isolated QA processes fail closed against repository secrets", () => {
    expect(shouldLoadApiLocalEnvFile({ API_LOCAL_ENV_FILE_ENABLED: "false" })).toBe(false);
  });
});
