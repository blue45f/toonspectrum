from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{relative}: expected exactly one replacement target, found {count}: {old[:160]!r}"
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "apps/api/src/modules/studio-ai/studio-3d-generation-job-ledger.ts",
    '''    readonly modelId: string;
    readonly actualCredits: number;
  }): Promise<Studio3dGenerationJobRecord> {
''',
    '''    readonly modelId: string;
    readonly actualCredits: number;
    readonly persistArtifact?: (artifact: {
      readonly revision: Studio3dGenerationArtifactRevision;
      readonly bytes: Uint8Array;
    }) => Promise<void>;
  }): Promise<Studio3dGenerationJobRecord> {
''',
)

replace_once(
    "apps/api/src/modules/studio-ai/studio-3d-generation-job-ledger.ts",
    '''      const next = Object.freeze({
        ...record,
        state: "ready" as const,
''',
    '''      const storedArtifact = Object.freeze({
        revision: artifactRevision,
        bytes: new Uint8Array(input.bytes),
      });
      await input.persistArtifact?.(storedArtifact);
      const next = Object.freeze({
        ...record,
        state: "ready" as const,
''',
)

replace_once(
    "apps/api/src/modules/studio-ai/studio-3d-generation.service.ts",
    '''      modelId: `model_${sha256(binary.bytes).slice(0, 24)}`,
      actualCredits: record.estimatedCredits,
    });
''',
    '''      modelId: `model_${sha256(binary.bytes).slice(0, 24)}`,
      actualCredits: record.estimatedCredits,
      persistArtifact: (artifact) => this.#artifactStore.putArtifact(artifact),
    });
''',
)

replace_once(
    "apps/api/src/modules/studio-ai/studio-3d-generation.service.ts",
    '''    if (!ready.artifactRevision) throw new TypeError("ready 3D job has no artifact revision.");
    await this.#artifactStore.putArtifact({
      revision: ready.artifactRevision,
      bytes: new Uint8Array(binary.bytes),
    });
    await this.#identityStore.delete(record.id);
''',
    '''    if (!ready.artifactRevision) throw new TypeError("ready 3D job has no artifact revision.");
    await this.#identityStore.delete(record.id);
''',
)

print("studio 3D artifact atomicity fix applied")
