// Offline fallback: executes the exact pure-domain test assertions with Node's test runner.
// This does NOT claim to run Vitest, React, the repository build, or a headset integration.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/domains/creator/bg3d');
let ts;
try { ts = require('typescript'); }
catch { throw new Error('TypeScript must be installed locally, or exposed via NODE_PATH.'); }
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'toonstudio-spatial-tests-'));
try {
  const model = path.join(source, 'studio-bg3d-spatial-storyboard.ts');
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), model,
    '--strict', '--noUncheckedIndexedAccess', '--target', 'ES2022', '--module', 'commonjs', '--outDir', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  for (const name of ['studio-bg3d-spatial-storyboard.ts', 'studio-bg3d-spatial-storyboard.test.ts', 'StudioBg3dSpatialStoryboardLauncher.tsx', 'StudioBg3dSpatialStoryboardPanel.tsx', 'StudioBg3dSpatialStoryboardPanel.test.tsx', 'StudioBg3dViewPanel.tsx']) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(source, name), 'utf8'), {
      fileName: name, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const errors = (compiled.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => root, getCanonicalFileName: (file) => file, getNewLine: () => '\n',
    }));
    if (name === 'studio-bg3d-spatial-storyboard.test.ts') {
      fs.writeFileSync(path.join(target, 'spatial.test.cjs'), compiled.outputText.replace('require("vitest")', 'require("node:test")'));
    }
  }
  const tests = spawnSync(process.execPath, ['--test', path.join(target, 'spatial.test.cjs')], { stdio: 'inherit' });
  process.exitCode = tests.status ?? 1;
} finally { fs.rmSync(target, { recursive: true, force: true }); }
