import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_AI_WORKBENCH,
  ENGINEERING_BENCHMARK_GROUPS,
  ENGINEERING_FILM_CUTS,
  ENGINEERING_PLAYBOOK_DOSSIERS,
  ENGINEERING_PLAYBOOK_PRINCIPLES,
  ENGINEERING_REUSE_BLUEPRINTS,
  ENGINEERING_SEMINAR_MODULES,
} from "./engineering-playbook-content";

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

describe("engineering playbook content", () => {
  it("keeps every public collection uniquely addressable and substantial", () => {
    for (const collection of [
      ENGINEERING_PLAYBOOK_PRINCIPLES,
      ENGINEERING_PLAYBOOK_DOSSIERS,
      ENGINEERING_BENCHMARK_GROUPS,
      ENGINEERING_AI_WORKBENCH,
      ENGINEERING_FILM_CUTS,
      ENGINEERING_SEMINAR_MODULES,
      ENGINEERING_REUSE_BLUEPRINTS,
    ]) {
      expect(unique(collection.map((item) => item.id))).toBe(true);
    }

    expect(ENGINEERING_PLAYBOOK_PRINCIPLES).toHaveLength(5);
    expect(ENGINEERING_PLAYBOOK_DOSSIERS).toHaveLength(10);
    expect(ENGINEERING_BENCHMARK_GROUPS).toHaveLength(5);
    expect(ENGINEERING_AI_WORKBENCH.length).toBeGreaterThanOrEqual(6);
    expect(ENGINEERING_FILM_CUTS).toHaveLength(4);
    expect(ENGINEERING_REUSE_BLUEPRINTS).toHaveLength(6);
  });

  it("connects each technical dossier to decisions, achievements, reuse and limits", () => {
    for (const dossier of ENGINEERING_PLAYBOOK_DOSSIERS) {
      expect(dossier.architecture.length, dossier.id).toBeGreaterThanOrEqual(4);
      expect(dossier.achievements.length, dossier.id).toBeGreaterThanOrEqual(3);
      expect(dossier.portability.length, dossier.id).toBeGreaterThanOrEqual(2);
      expect(dossier.limits.length, dossier.id).toBeGreaterThanOrEqual(2);
      expect(dossier.evidence.length, dossier.id).toBeGreaterThanOrEqual(3);
      for (const evidencePath of dossier.evidence) {
        const [repositoryPath] = evidencePath.split("#", 1);
        expect(existsSync(repositoryPath), `${dossier.id}: missing evidence ${evidencePath}`).toBe(true);
      }
      expect(dossier.question.ko.trim(), dossier.id).not.toBe("");
      expect(dossier.question.en.trim(), dossier.id).not.toBe("");
    }
  });

  it("keeps benchmarking explicit about lessons, application and prohibited parity claims", () => {
    for (const group of ENGINEERING_BENCHMARK_GROUPS) {
      expect(group.products.length, group.id).toBeGreaterThanOrEqual(3);
      expect(unique(group.products), group.id).toBe(true);
      expect(group.learned.length, group.id).toBeGreaterThanOrEqual(3);
      expect(group.applied.length, group.id).toBeGreaterThanOrEqual(2);
      expect(group.doNotClaim.length, group.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("provides a complete 120-minute seminar with demo and discussion prompts", () => {
    expect(ENGINEERING_SEMINAR_MODULES.reduce((sum, module) => sum + module.minutes, 0)).toBe(120);
    for (const module of ENGINEERING_SEMINAR_MODULES) {
      expect(module.minutes, module.id).toBeGreaterThan(0);
      expect(module.learning.length, module.id).toBeGreaterThanOrEqual(2);
      expect(module.demo.ko.trim(), module.id).not.toBe("");
      expect(module.discussion.ko.trim(), module.id).not.toBe("");
    }
  });

  it("keeps film cuts evidence-led and AI workflows artifact-led", () => {
    expect(ENGINEERING_FILM_CUTS.map((cut) => cut.duration)).toEqual(["15s", "45s", "90s", "6m"]);
    for (const cut of ENGINEERING_FILM_CUTS) {
      expect(cut.beats.length, cut.id).toBeGreaterThanOrEqual(3);
      expect(cut.proof.length, cut.id).toBeGreaterThanOrEqual(2);
      expect(cut.avoid.length, cut.id).toBeGreaterThanOrEqual(2);
    }
    for (const workflow of ENGINEERING_AI_WORKBENCH) {
      expect(workflow.tools.length, workflow.id).toBeGreaterThanOrEqual(3);
      expect(workflow.artifact.ko.trim(), workflow.id).not.toBe("");
      expect(workflow.guardrail.ko.trim(), workflow.id).not.toBe("");
    }
  });

  it("does not embed credentials in the public playbook", () => {
    const serialized = JSON.stringify({
      ENGINEERING_AI_WORKBENCH,
      ENGINEERING_PLAYBOOK_DOSSIERS,
      ENGINEERING_REUSE_BLUEPRINTS,
    });
    expect(serialized).not.toMatch(/sk-[a-z0-9]{12,}/iu);
    expect(serialized).not.toMatch(/client_secret\s*[:=]\s*["'][^${]/iu);
    expect(serialized).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^${]/iu);
  });
});
