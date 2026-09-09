import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

interface AcceptanceRequirement {
  readonly issue: number;
  readonly label: string;
  readonly files: readonly string[];
  readonly sourceTerms: readonly string[];
}

const ROOT = process.cwd();

const REQUIREMENTS: readonly AcceptanceRequirement[] = [
  {
    issue: 558,
    label: "editable Smart Shape workflow",
    files: [
      "apps/web/src/domains/creator/studio-smart-shape-host-session.ts",
      "apps/web/src/domains/creator/StudioSmartShapeEditDialog.tsx",
      "scripts/verify-studio-brushes.mts",
    ],
    sourceTerms: ["brush.correct-current-stroke", "Alt+Shift+Q"],
  },
  {
    issue: 559,
    label: "non-destructive adjustment/live-effect graph",
    files: [
      "apps/web/src/domains/creator/filter/studio-adjustment-effect-graph.ts",
      "apps/web/src/domains/creator/layer/studio-layer-effects-stack.ts",
    ],
    sourceTerms: ["validateStudioAdjustmentEffectGraph", "transactStudioEffectGraph"],
  },
  {
    issue: 561,
    label: "3D surface painting, dilation, attachment and export",
    files: [
      "apps/web/src/domains/creator/vrm/studio-vrm-texture-dilation.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-attachment-graph.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-export.ts",
    ],
    sourceTerms: ["dilateStudioVrmTexture", "reparentStudioAttachment"],
  },
  {
    issue: 562,
    label: "cel/camera/audio/animatic timeline",
    files: [
      "apps/web/src/domains/creator/animation/studio-timeline-timebase.ts",
      "apps/web/src/domains/creator/StudioStoryboardGridPanel.tsx",
    ],
    sourceTerms: ["planStudioAudioDriftCorrection", "cancelStudioTimelineExport"],
  },
  {
    issue: 563,
    label: "structured layered AI editing",
    files: [
      "apps/web/src/domains/creator/ai/studio-structured-edit-proposal.ts",
      "apps/web/src/domains/creator/ai/studio-ai-comic-composer-handoff.ts",
      "apps/web/src/domains/creator/StudioScenarioCandidateDesk.tsx",
    ],
    sourceTerms: ["applyStudioStructuredEditReview", "selectedArtifactIds"],
  },
  {
    issue: 569,
    label: "immutable asset families and bounded batch generation",
    files: [
      "apps/web/src/domains/creator/studio-asset-family-revision.ts",
      "apps/web/src/domains/creator/StudioUnifiedAssetSmartLibrary.tsx",
    ],
    sourceTerms: ["resolveStudioExactAssetReference", "createStudioAssetBatchQueue"],
  },
  {
    issue: 571,
    label: "stroke-level co-creative proposals",
    files: ["apps/web/src/domains/creator/ai/studio-stroke-proposal.ts"],
    sourceTerms: ["applyStudioStrokeProposalReview", "planStudioStrokeGhostPreview"],
  },
  {
    issue: 573,
    label: "provider-neutral 3D generation ledger and Rodin adapter",
    files: [
      "apps/api/src/modules/studio-ai/studio-3d-generation-job-ledger.ts",
      "apps/api/src/modules/studio-ai/studio-3d-generation-provider.ts",
      "apps/api/src/modules/studio-ai/studio-hyper3d-rodin-provider.ts",
    ],
    sourceTerms: ["Studio3dGenerationJobLedger", "internalizeArtifact"],
  },
  {
    issue: 580,
    label: "professional color management and soft proofing",
    files: [
      "apps/web/src/domains/creator/studio-soft-proofing.ts",
      "apps/web/src/domains/creator/studio-lab-color.ts",
    ],
    sourceTerms: ["applyStudioSoftProof", "toneMapStudioHdr"],
  },
];

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(path.join(ROOT, file))).isFile();
  } catch {
    return false;
  }
}

async function readAllSource(files: readonly string[]): Promise<string> {
  const texts: string[] = [];
  for (const file of files) {
    if (await exists(file)) texts.push(await readFile(path.join(ROOT, file), "utf8"));
  }
  return texts.join("\n");
}

const results: Array<{
  issue: number;
  label: string;
  passed: boolean;
  missingFiles: string[];
  missingTerms: string[];
}> = [];

for (const requirement of REQUIREMENTS) {
  const missingFiles: string[] = [];
  for (const file of requirement.files) {
    if (!(await exists(file))) missingFiles.push(file);
  }
  const source = await readAllSource(requirement.files);
  const missingTerms = requirement.sourceTerms.filter((term) => !source.includes(term));
  results.push({
    issue: requirement.issue,
    label: requirement.label,
    passed: missingFiles.length === 0 && missingTerms.length === 0,
    missingFiles,
    missingTerms,
  });
}

const temporaryFiles: string[] = [];
for (const folder of [".codex", "artifacts"]) {
  try {
    for (const name of await readdir(path.join(ROOT, folder))) {
      if (/payload|one-shot|apply-studio-epic|source-snapshot/iu.test(name)) temporaryFiles.push(`${folder}/${name}`);
    }
  } catch {
    // Optional folders do not exist in clean checkouts.
  }
}

console.table(results.map(({ issue, label, passed }) => ({ issue, label, status: passed ? "PASS" : "FAIL" })));
if (temporaryFiles.length > 0) {
  console.error("Temporary integration payloads must not ship:", temporaryFiles);
}
const failed = results.filter((result) => !result.passed);
if (failed.length > 0 || temporaryFiles.length > 0) {
  console.error(JSON.stringify({ failed, temporaryFiles }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`All ${results.length} remaining Studio issue contracts are present.`);
}
