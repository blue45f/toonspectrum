import { describe, expect, it } from "vitest";

import type { IntegrationRuntimeConnectorStatus } from "./integration-platform-types";
import {
  buildRuntimeExecutionRequest,
  executionResultLabel,
  newIntegrationMutationId,
  parseRuntimeInput,
  runtimeExampleJson,
} from "./integration-runtime-workbench-model";

const connector: IntegrationRuntimeConnectorStatus = {
  providerId: "wikidata",
  name: "Wikidata",
  action: "trends.read",
  category: "data",
  configured: true,
  missingConfigurationCount: 0,
  writesExternalState: false,
  executionMode: "public-protocol",
  summary: "Search public metadata.",
  exampleInput: { query: "Work", language: "en", limit: 5 },
};

describe("integration runtime workbench model", () => {
  it("serializes provider examples as editable pretty JSON", () => {
    expect(runtimeExampleJson(connector)).toBe(
      '{\n  "query": "Work",\n  "language": "en",\n  "limit": 5\n}',
    );
  });

  it("requires a JSON object instead of arrays or invalid text", () => {
    expect(parseRuntimeInput('{"query":"Work"}')).toEqual({ query: "Work" });
    expect(() => parseRuntimeInput("not-json")).toThrow("JSON");
    expect(() => parseRuntimeInput("[]")).toThrow("JSON 객체");
  });

  it("builds a dry-run request without live confirmation", () => {
    expect(buildRuntimeExecutionRequest({
      connector,
      projectId: " project-1 ",
      mutationId: "11111111-1111-4111-8111-111111111111",
      inputJson: runtimeExampleJson(connector),
      dryRun: true,
      confirm: false,
    })).toEqual({
      projectId: "project-1",
      mutationId: "11111111-1111-4111-8111-111111111111",
      dryRun: true,
      confirm: false,
      request: {
        providerId: "wikidata",
        action: "trends.read",
        input: { query: "Work", language: "en", limit: 5 },
      },
    });
  });

  it("requires explicit confirmation for a live request", () => {
    expect(() => buildRuntimeExecutionRequest({
      connector,
      projectId: "project-1",
      mutationId: "11111111-1111-4111-8111-111111111111",
      inputJson: runtimeExampleJson(connector),
      dryRun: false,
      confirm: false,
    })).toThrow("확인란");
  });

  it("uses the supplied UUID source and labels replayed receipts", () => {
    expect(newIntegrationMutationId({ randomUUID: () => "uuid-1" })).toBe("uuid-1");
    expect(executionResultLabel("succeeded", true)).toContain("재사용");
    expect(executionResultLabel("planned")).toContain("계획");
  });
});
