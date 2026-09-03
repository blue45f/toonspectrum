import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, "src/domains/market/components/MarketplaceAuthoringInstallAction.tsx");
if (!existsSync(target)) throw new Error("MarketplaceAuthoringInstallAction.tsx is missing");
let source = readFileSync(target, "utf8");

const packageImport = `import { extractCreatorMarketplaceManifestFromZip } from "@/lib/creator-marketplace-package-builder";`;
if (!source.includes(packageImport)) source = `${packageImport}\n\n${source}`;

const before = `async function loadRemoteEnvelope(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(\`제작 manifest를 불러오지 못했습니다 (\${response.status}).\`);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > MAX_REMOTE_MANIFEST_BYTES) throw new Error("제작 manifest가 허용 크기를 초과했습니다.");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/(json|text)/iu.test(contentType) && !/\\.json(?:$|\\?)/iu.test(url)) return null;
  const body = await response.text();
  if (body.length > MAX_REMOTE_MANIFEST_BYTES) throw new Error("제작 manifest가 허용 크기를 초과했습니다.");
  const parsed: unknown = JSON.parse(body);
  return findAuthoringEnvelope(parsed);
}`;
const after = `async function loadRemoteEnvelope(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(\`제작 manifest를 불러오지 못했습니다 (\${response.status}).\`);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > MAX_REMOTE_MANIFEST_BYTES) throw new Error("제작 manifest가 허용 크기를 초과했습니다.");
  const contentType = response.headers.get("content-type") ?? "";
  const isPackage = /(zip|toonspectrum\\.marketplace)/iu.test(contentType)
    || /\\.toonmarket\\.zip(?:$|\\?)/iu.test(url);
  if (isPackage) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_REMOTE_MANIFEST_BYTES) {
      throw new Error("제작 패키지가 브라우저 복구 허용 크기를 초과했습니다.");
    }
    return findAuthoringEnvelope(extractCreatorMarketplaceManifestFromZip(bytes));
  }
  if (!/(json|text)/iu.test(contentType) && !/\\.json(?:$|\\?)/iu.test(url)) return null;
  const body = await response.text();
  if (body.length > MAX_REMOTE_MANIFEST_BYTES) throw new Error("제작 manifest가 허용 크기를 초과했습니다.");
  const parsed: unknown = JSON.parse(body);
  return findAuthoringEnvelope(parsed);
}`;
if (!source.includes(after)) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Remote package recovery anchor count was ${count}`);
  source = source.replace(before, after);
}

writeFileSync(target, source);
writeFileSync(
  resolve(root, "marketplace-package-recovery-integration-report.json"),
  `${JSON.stringify({ target: "MarketplaceAuthoringInstallAction.tsx", status: "integrated" }, null, 2)}\n`,
);
