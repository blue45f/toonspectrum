#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourceDir = join(root, "src/domains/creator/storyworld");
const outDir = mkdtempSync(join(tmpdir(), "toonspectrum-storyworld-"));
let checks = 0;

function checkEqual(actual, expected, message) {
  checks += 1;
  assert.equal(actual, expected, message);
}

function checkDeepEqual(actual, expected, message) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}

function checkOk(value, message) {
  checks += 1;
  assert.ok(value, message);
}

function healthyProject(engine) {
  return {
    schemaVersion: engine.STUDIO_STORYWORLD_SCHEMA_VERSION,
    id: "verify-healthy",
    title: "검증용 건강한 세계",
    productionCapacityMinutes: 120,
    metadata: { receiptTimestampIso: "2026-09-05T00:00:00.000Z" },
    characters: [{ id: "hero", name: "주인공", initialFactIds: ["door-open"] }],
    facts: [{
      id: "door-open",
      label: "문이 열려 있다",
      subjectId: "door",
      key: "open",
      initialValue: true,
      intendedReaderRevealOrder: 1,
    }],
    scenes: [{
      id: "scene-1",
      title: "열린 문",
      order: 1,
      participantIds: ["hero"],
      preconditions: [{ factId: "door-open", comparator: "equals", value: true }],
      knowledgeUses: [{ characterId: "hero", factId: "door-open" }],
      reveals: [{ factId: "door-open", audiences: ["reader"] }],
      emotionalBeats: [{ characterId: "hero", valence: 0.1, arousal: 0.2 }],
      localization: [{
        locale: "en-US",
        sourceCharacters: 6,
        translatedCharacters: 7,
        balloonCapacityCharacters: 10,
      }],
      accessibility: {
        logicalReadingOrder: true,
        nonColorCue: true,
        textAlternative: true,
        soundMeaningVisualized: true,
        reducedMotionEquivalent: true,
      },
      assets: [{
        assetId: "door-bg",
        label: "문 배경",
        revision: "sha256:door",
        licenseStatus: "cleared",
        consentStatus: "not-required",
        reusable: true,
      }],
      production: {
        drawingMinutes: 30,
        letteringMinutes: 10,
        renderMinutes: 5,
        reviewMinutes: 5,
        complexity: 3,
      },
    }],
  };
}

function validateCssCoverage() {
  const page = readFileSync(join(sourceDir, "StudioStoryworldLabPage.tsx"), "utf8");
  const css = readFileSync(join(sourceDir, "studio-storyworld-lab.css"), "utf8");
  const used = new Set();
  for (const match of page.matchAll(/storyworld-[a-z0-9_-]+/g)) used.add(match[0]);
  const nonClassTokens = new Set(["storyworld-causality", "storyworld-catalog", "storyworld-lab"]);
  const missing = [...used].filter((className) =>
    !nonClassTokens.has(className) && !css.includes(`.${className}`)
  );
  checkDeepEqual(missing, [], `CSS selectors missing for: ${missing.join(", ")}`);
  return used.size;
}

function validateStrictSurfaceTypes() {
  const typeRoot = mkdtempSync(join(tmpdir(), "toonspectrum-storyworld-types-"));
  const targetDir = join(typeRoot, "src/domains/creator/storyworld");
  mkdirSync(targetDir, { recursive: true });
  for (const fileName of [
    "StudioStoryworldLabPage.tsx",
    "studio-storyworld-causality.ts",
    "studio-storyworld-catalog.ts",
    "studio-storyworld-causality.test.ts",
  ]) {
    writeFileSync(
      join(targetDir, fileName),
      readFileSync(join(sourceDir, fileName), "utf8"),
    );
  }
  writeFileSync(join(typeRoot, "stubs.d.ts"), String.raw`
declare namespace JSX {
  type Element = any;
  interface IntrinsicAttributes { key?: string | number; }
  interface IntrinsicElements {
    select: { onChange?: (event: import("react").ChangeEvent<HTMLSelectElement>) => void; [key: string]: any };
    textarea: { onChange?: (event: import("react").ChangeEvent<HTMLTextAreaElement>) => void; [key: string]: any };
    input: { onChange?: (event: import("react").ChangeEvent<HTMLInputElement>) => void; [key: string]: any };
    [name: string]: any;
  }
}
declare module "react" {
  export type ReactNode = any;
  export type SetStateAction<S> = S | ((previous: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface MutableRefObject<T> { current: T; }
  export interface ChangeEvent<T = Element> { target: T; currentTarget: T; }
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T | null): MutableRefObject<T | null>;
}
declare module "react/jsx-runtime" {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): JSX.Element;
  export function jsxs(type: any, props: any, key?: any): JSX.Element;
}
declare module "lucide-react" {
  type Icon = (props: Record<string, unknown>) => JSX.Element;
  export const AlertTriangle: Icon; export const ArrowLeft: Icon; export const BadgeCheck: Icon;
  export const BookOpenCheck: Icon; export const BrainCircuit: Icon; export const CheckCircle2: Icon;
  export const ChevronRight: Icon; export const CircleDot: Icon; export const Download: Icon;
  export const FileJson: Icon; export const FlaskConical: Icon; export const GitBranch: Icon;
  export const Import: Icon; export const Info: Icon; export const Network: Icon;
  export const RefreshCcw: Icon; export const Save: Icon; export const ShieldCheck: Icon;
  export const Sparkles: Icon; export const TimerReset: Icon; export const Users: Icon;
  export const WandSparkles: Icon; export const XCircle: Icon;
}
declare module "vitest" {
  type Matcher = {
    toEqual(value: unknown): void; toContain(value: unknown): void; toHaveLength(value: number): void;
    toBe(value: unknown): void; toBeLessThan(value: number): void; toBeGreaterThan(value: number): void;
  };
  type Expect = ((value: unknown) => Matcher) & {
    arrayContaining(value: readonly unknown[]): unknown;
    objectContaining(value: Record<string, unknown>): unknown;
  };
  export const expect: Expect;
  export function describe(name: string, body: () => void): void;
  export function it(name: string, body: () => void | Promise<void>): void;
}
declare module "*.css" { const value: string; export default value; }
declare module "@/src/compat/router-link" {
  const Link: (props: { to: string; children?: any; [key: string]: any }) => JSX.Element;
  export default Link;
}
declare module "@/src/hooks/use-document-title" { export function useDocumentTitle(title: string): void; }
`);
  writeFileSync(join(typeRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["DOM", "DOM.Iterable", "ESNext"],
      strict: true,
      noEmit: true,
      module: "ESNext",
      moduleResolution: "Bundler",
      isolatedModules: true,
      verbatimModuleSyntax: true,
      jsx: "react-jsx",
      baseUrl: ".",
      paths: { "@/*": ["./*"] },
      skipLibCheck: true,
    },
    include: ["src/**/*.ts", "src/**/*.tsx", "stubs.d.ts"],
  }, null, 2));
  try {
    execFileSync("tsc", ["-p", join(typeRoot, "tsconfig.json")], { stdio: "inherit" });
    checkOk(true, "strict Storyworld UI/test typecheck");
  } finally {
    rmSync(typeRoot, { recursive: true, force: true });
  }
}

try {
  execFileSync("tsc", [
    "--noEmit", "false",
    "--strict",
    "--target", "ES2022",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--lib", "ES2023,DOM",
    "--outDir", outDir,
    join(sourceDir, "studio-storyworld-causality.ts"),
    join(sourceDir, "studio-storyworld-catalog.ts"),
  ], { stdio: "inherit" });

  const engine = require(join(outDir, "studio-storyworld-causality.js"));
  const catalogue = require(join(outDir, "studio-storyworld-catalog.js"));

  const first = engine.analyzeStoryworldProject(engine.STORYWORLD_DEMO_PROJECT);
  const second = engine.analyzeStoryworldProject(engine.STORYWORLD_DEMO_PROJECT);
  checkDeepEqual(first.receipt, second.receipt, "proof receipt must be deterministic");
  checkDeepEqual(first.orderedSceneIds, ["s10", "s20", "s30", "s40"]);
  checkEqual(first.receipt.deterministic, true, "receipt must identify deterministic analysis");
  checkOk(/^[0-9a-f]{8}$/.test(first.receipt.projectFingerprint), "project fingerprint shape");
  checkOk(/^[0-9a-f]{8}$/.test(first.receipt.issueFingerprint), "issue fingerprint shape");
  checkEqual(first.worldTimeline.length, 4, "demo timeline projection");
  checkOk(first.knowledgeMatrix.some((row) => row.characterId === "haeun"), "knowledge projection");
  checkOk((first.production.utilizationPercent ?? 0) > 100, "demo production twin must surface overload");
  checkOk(first.repairProposals.length > 0, "explainable repair proposals");
  checkEqual(first.axisScores.length, 9, "all product quality axes must be scored");
  checkOk(first.axisScores.every((axis) => axis.score >= 0 && axis.score <= 100), "axis score bounds");
  const frontier = engine.rankStoryworldParetoFrontier([
    { id: "baseline", label: "기준", result: first },
    { id: "branch", label: "분기", result: engine.simulateStoryworldCounterfactual(
      engine.STORYWORLD_DEMO_PROJECT,
      { kind: "disable-scene", sceneId: "s20" },
    ).branch },
  ]);
  checkOk(frontier.some((candidate) => candidate.frontier), "Pareto frontier must retain an option");

  const expectedDemoCodes = [
    "knowledge-leak",
    "localization-overflow",
    "accessibility-gap",
    "rights-risk",
    "missing-provenance",
    "production-over-capacity",
  ];
  const demoCodes = new Set(first.issues.map((issue) => issue.code));
  for (const code of expectedDemoCodes) checkOk(demoCodes.has(code), `missing demo issue ${code}`);

  const healthy = engine.analyzeStoryworldProject(healthyProject(engine));
  checkEqual(healthy.issues.length, 0, "fully evidenced fixture should be issue-free");
  checkEqual(healthy.overallScore, 100);

  const branch = engine.simulateStoryworldCounterfactual(engine.STORYWORLD_DEMO_PROJECT, {
    kind: "disable-scene",
    sceneId: "s20",
  });
  checkDeepEqual(branch.impactedSceneIds, ["s20", "s30", "s40"]);
  checkOk(branch.branch.issues.some((issue) => issue.code === "inactive-dependency"));
  checkOk(branch.branch.issues.some((issue) =>
    issue.code === "contradicted-precondition" && issue.factId === "key-owned"
  ));
  checkOk(branch.scoreDelta < 0);

  const motifProject = healthyProject(engine);
  motifProject.motifs = [{ id: "bell", label: "종", minOccurrences: 2, maxGapScenes: 1 }];
  motifProject.scenes = [
    { ...motifProject.scenes[0], id: "a", order: 10, motifIds: ["bell"] },
    { ...motifProject.scenes[0], id: "b", order: 100, motifIds: [] },
    { ...motifProject.scenes[0], id: "c", order: 1000, motifIds: ["bell"] },
  ];
  const motifResult = engine.analyzeStoryworldProject(motifProject);
  checkEqual(motifResult.motifLedger[0].largestGapScenes, 1);
  checkOk(!motifResult.issues.some((issue) => issue.code === "motif-gap"));

  checkEqual(catalogue.STORYWORLD_CAPABILITIES.length, 50);
  checkEqual(
    new Set(catalogue.STORYWORLD_CAPABILITIES.map((capability) => capability.id)).size,
    50,
    "capability ids must be unique",
  );
  const maturityCounts = catalogue.storyworldCapabilityCounts();
  checkEqual(maturityCounts.engine + maturityCounts.adapter + maturityCounts.experimental, 50);

  validateStrictSurfaceTypes();
  const styledClassCount = validateCssCoverage();

  console.log(JSON.stringify({
    status: "passed",
    checks,
    demoScore: first.overallScore,
    demoIssueCount: first.issues.length,
    branchScoreDelta: branch.scoreDelta,
    capabilityCount: catalogue.STORYWORLD_CAPABILITIES.length,
    maturityCounts,
    styledClassCount,
    projectFingerprint: first.receipt.projectFingerprint,
    issueFingerprint: first.receipt.issueFingerprint,
  }, null, 2));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
