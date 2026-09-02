import { describe, expect, it } from "vitest";

import {
  MYB_MAPPED_SETTINGS,
  MYB_PARSED_INERT_SETTINGS,
  MYB_PROVIDER_NATIVE_SETTINGS,
  MYB_SETTING_TABLE,
} from "../../../studio-format-gateway/src/myb";
import {
  HOKUSAI_EVALUATED_SETTINGS,
  HOKUSAI_PARSED_INERT_SETTINGS,
} from "../raster-compile";

/**
 * Cross-package drift guard for the `.myb` disposition table.
 *
 * The dependency runs ONE way: studio-brush-platform imports
 * studio-format-gateway's myb importer, never the reverse. So the gateway's
 * classification table hand-mirrors the Hokusai raster compiler's setting
 * lists, and this test — living on the importing side, where both are
 * reachable — is what keeps the copy honest.
 *
 * Invariant: every setting the Hokusai compiler consumes must be classified,
 * and must be `provider-native` UNLESS the common IR also carries it (the
 * `mapped-*` dispositions). A setting Hokusai evaluates may never be
 * `parsed-inert`, `unsupported`, or missing — those are exactly the states
 * that make the importer warn about a setting the default provider renders.
 */
describe("myb table ↔ hokusai raster compiler drift", () => {
  const evaluated = [...HOKUSAI_EVALUATED_SETTINGS].sort();

  it("classifies every setting the Hokusai compiler evaluates", () => {
    const unclassified = evaluated.filter(
      (setting) => MYB_SETTING_TABLE[setting] === undefined,
    );
    expect(unclassified).toEqual([]);
  });

  it("treats Hokusai-evaluated settings as provider-native unless the IR maps them", () => {
    const misclassified = evaluated.filter(
      (setting) =>
        !MYB_PROVIDER_NATIVE_SETTINGS.has(setting) && !MYB_MAPPED_SETTINGS.has(setting),
    );
    expect(misclassified).toEqual([]);
  });

  it("never marks a provider-native setting as something Hokusai cannot see", () => {
    const orphans = [...MYB_PROVIDER_NATIVE_SETTINGS].filter(
      (setting) => !HOKUSAI_EVALUATED_SETTINGS.has(setting),
    );
    expect(orphans).toEqual([]);
  });

  it("mirrors the settings Hokusai parses but never evaluates as parsed-inert", () => {
    const drifted = [...HOKUSAI_PARSED_INERT_SETTINGS].filter(
      (setting) => !MYB_PARSED_INERT_SETTINGS.has(setting),
    );
    expect(drifted).toEqual([]);
  });
});
