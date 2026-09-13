/** Wrap the REAL worker's runtime import graph; never rewrite its routing logic. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const sourceRoot = path.join(root, 'apps/web/src');
const entry = path.join(sourceRoot, 'app/service-worker/studio-service-worker-entry.ts');
const modules = new Map();

function resolveDependency(parent, specifier) {
  if (!specifier.startsWith('.')) throw new Error(`Unsupported worker dependency: ${specifier}`);
  const base = path.resolve(path.dirname(parent), specifier);
  const file = [base + '.ts', base + '.tsx', base, path.join(base, 'index.ts')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file || path.relative(sourceRoot, file).startsWith('..')) {
    throw new Error(`Missing or out-of-tree worker dependency: ${specifier} from ${parent}`);
  }
  return file;
}

function visit(file) {
  const id = path.relative(root, file).split(path.sep).join('/');
  if (modules.has(id)) return id;
  const { outputText, diagnostics = [] } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const record = { code: outputText, dependencies: {} };
  modules.set(id, record);
  const ast = ts.createSourceFile(file + '.js', outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  function collect(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'require') {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) {
        throw new Error(`Non-literal runtime dependency in ${file}`);
      }
      const specifier = node.arguments[0].text;
      record.dependencies[specifier] = visit(resolveDependency(file, specifier));
    }
    ts.forEachChild(node, collect);
  }
  collect(ast);
  return id;
}

const entryId = visit(entry);
const manifest = { buildId: 'outage-regression', criticalUrls: [], shellUrls: ['/studio'], warmUrls: [] };
let text = `const __STUDIO_SERVICE_WORKER_MANIFEST__ = ${JSON.stringify(manifest)};\n`;
text += 'const modules = Object.create(null), cache = Object.create(null);\n';
text += `const dependencies = ${JSON.stringify(Object.fromEntries([...modules].map(([id, record]) => [id, record.dependencies])))};\n`;
for (const [id, record] of modules) {
  text += `modules[${JSON.stringify(id)}] = function(module, exports, require) {\n${record.code}\n};\n`;
}
text += `function require(id) {
  if (cache[id]) return cache[id].exports;
  if (!modules[id]) throw new Error('Missing bundled module: ' + id);
  const module = { exports: {} }; cache[id] = module;
  modules[id](module, module.exports, specifier => {
    const dependency = dependencies[id][specifier];
    if (!dependency) throw new Error('Missing dependency: ' + specifier + ' from ' + id);
    return require(dependency);
  });
  return module.exports;
}\nrequire(${JSON.stringify(entryId)});\n`;
fs.writeFileSync(path.join(root, 'apps/web/public/__test-sw.js'), text);
console.log(`Compiled actual worker with ${modules.size} runtime modules.`);
