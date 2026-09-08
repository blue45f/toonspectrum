import { readFile, writeFile } from "node:fs/promises";

async function transform(path, mutate) {
  const source = await readFile(path, "utf8");
  const next = mutate(source);
  if (next === source) {
    console.log(`No patch required: ${path}`);
    return;
  }
  await writeFile(path, next, "utf8");
  console.log(`Patched: ${path}`);
}

function replaceIfMissing(source, marker, anchor, replacement) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`anchor not found: ${anchor}`);
  return source.replace(anchor, replacement);
}

await transform(
  "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
  (source) => {
    const importAnchor =
      'import { createStudioScenarioImageGenerationExecutors } from "./ai/studio-scenario-image-generation";';
    const importLine =
      'import { compileStudioAiComicDirectorApplyElements } from "./ai/studio-ai-comic-director-apply-elements";';
    let next = replaceIfMissing(
      source,
      importLine,
      importAnchor,
      `${importLine}\n${importAnchor}`,
    );

    const start = "    const newEls: El[] = [];\n    for (const item of scenarioResult.items) {";
    const end = "    if (newEls.length === 0) return;";
    const startIndex = next.indexOf(start);
    const endIndex = next.indexOf(end, startIndex);
    if (startIndex < 0 || endIndex < 0) {
      if (!next.includes("compileStudioAiComicDirectorApplyElements({")) {
        throw new Error("scenario apply loop anchors not found");
      }
      return next;
    }
    const replacement = `    const { elements: newEls } = compileStudioAiComicDirectorApplyElements({\n      items: scenarioResult.items,\n      createId: uid,\n      textAiProvenance: scenarioResult.textAiProvenance,\n    });\n`;
    return `${next.slice(0, startIndex)}${replacement}${next.slice(endIndex)}`;
  },
);

await transform(
  "apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx",
  (source) => {
    let next = replaceIfMissing(
      source,
      "const [remoteRevision, setRemoteRevision]",
      "  const [session, setSession] = useState(() => initialSession(resolution));",
      "  const [session, setSession] = useState(() => initialSession(resolution));\n  const [remoteRevision, setRemoteRevision] = useState(session.revision);",
    );
    next = next.replace(
      "const result = await api.updateSession(session, session.revision);",
      "const result = await api.updateSession(session, remoteRevision);",
    );
    next = next.replaceAll(
      "setSession(created.data);\n          setSyncState(\"saved\");",
      "setSession(created.data);\n          setRemoteRevision(created.data.revision);\n          setSyncState(\"saved\");",
    );
    next = next.replace(
      "        setSession({\n          ...remote.data,\n          jobs: reconcileStudioAiComicDirectorJobs(remote.data.jobs),\n        });\n        setSyncState(\"saved\");",
      "        setSession({\n          ...remote.data,\n          jobs: reconcileStudioAiComicDirectorJobs(remote.data.jobs),\n        });\n        setRemoteRevision(remote.data.revision);\n        setSyncState(\"saved\");",
    );
    next = next.replaceAll(
      "      setSession(result.data);\n      setSyncState(\"saved\");",
      "      setSession(result.data);\n      setRemoteRevision(result.data.revision);\n      setSyncState(\"saved\");",
    );
    return next;
  },
);

await transform(
  "apps/web/src/domains/creator/ai/StudioAiComicDirectorPanel.tsx",
  (source) => source
    .replace("  Check,\n", "")
    .replace("  RefreshCw,\n", "")
    .replace("  STUDIO_TOUCH_TARGET,\n", "")
    .replace("  textProvenance,\n", ""),
);

await transform(
  "apps/web/src/domains/creator/studio-router/studio-ai-comic-director-route.test.ts",
  (source) => source.replace(
    'expect(resolved.lifecycleKey).toContain("work%3Awork-42");',
    'expect(resolved.lifecycleKey).toContain("work:work-42");',
  ),
);

await transform(
  "scripts/run-production-database-migrations.test.mjs",
  (source) => source
    .replace("expect(manifest).toHaveLength(44);", "expect(manifest).toHaveLength(45);")
    .replace(
      '    "0044_creator_work_entitlement_authorization",',
      '    "0045_studio_ai_comic_director",',
    )
    .replace(
      "expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(44);",
      "expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(45);",
    ),
);

await transform(
  "scripts/asset-platform-foundation-contract.test.mjs",
  (source) => source.replace(
    '    expect(manifest[43]).toBe("apps/api/src/db/migrations/0044_creator_work_entitlement_authorization.sql");',
    '    expect(manifest.at(-1)).toBe("apps/api/src/db/migrations/0045_studio_ai_comic_director.sql");',
  ),
);

await transform(
  "apps/api/src/modules/health/health-readiness.repository.ts",
  (source) => {
    let next = source;
    if (!next.includes('  "studio_ai_comic_director_session",')) {
      const anchor = '  "studio_ai_daily_quota",';
      if (!next.includes(anchor)) throw new Error("health relation anchor not found");
      next = next.replace(
        anchor,
        [
          '  "studio_ai_comic_director_approval",',
          '  "studio_ai_comic_director_artifact",',
          '  "studio_ai_comic_director_job",',
          '  "studio_ai_comic_director_job_event",',
          '  "studio_ai_comic_director_session",',
          anchor,
          '  "studio_ai_visual_bible_revision",',
        ].join("\n"),
      );
    }
    if (!next.includes('  "0045_studio_ai_comic_director",')) {
      const migrationAnchor = '  "0034_creator_marketplace_package_moderation",';
      if (!next.includes(migrationAnchor)) throw new Error("health migration anchor not found");
      next = next.replace(
        migrationAnchor,
        `${migrationAnchor}\n  "0045_studio_ai_comic_director",`,
      );
    }
    return next;
  },
);
