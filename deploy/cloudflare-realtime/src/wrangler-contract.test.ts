import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { describe, expect, it } from "vitest";

import { parseWranglerJsonc, readRealtimeIdentity } from "../test-support/wrangler-config";

const PRODUCTION_CONFIGS = ["../wrangler.jsonc", "../wrangler.jsonc.example"] as const;
const EXPECTED_IDENTITY = {
  name: "toonspectrum-realtime",
  issuer: "toonspectrum-api",
  audience: "toonspectrum-realtime",
} as const;

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function expectProductionContract(config: ReturnType<typeof parseWranglerJsonc>): void {
  // 두 파일이 동시에 잘못 바뀌어도 통과하지 않도록 배포 계약을 절대값으로 고정한다.
  expect(readRealtimeIdentity(config)).toEqual(EXPECTED_IDENTITY);
  expect(config.workers_dev).toBe(true);
  expect(config.preview_urls).toBe(false);
  expect(config.routes).toContainEqual(expect.objectContaining({
    pattern: "realtime.toonstudio.cloud",
    custom_domain: true,
  }));
}

function mutatedIdentity(field: string, value: unknown) {
  const config = parseWranglerJsonc(read("../wrangler.jsonc"));
  return parseWranglerJsonc(JSON.stringify(field === "name"
    ? { ...config, name: value }
    : { ...config, vars: { ...config.vars, [field]: value } }));
}

describe("Cloudflare realtime deployment contract", () => {
  it.each(PRODUCTION_CONFIGS)("%s의 identity와 운영 트리거를 절대값으로 검증한다", (path) => {
    expectProductionContract(parseWranglerJsonc(read(path)));
  });

  it("workerd 테스트도 운영과 같은 issuer/audience를 검증한다", () => {
    const identity = readRealtimeIdentity(parseWranglerJsonc(read("../wrangler.test.jsonc")));
    expect(identity).toEqual({ ...EXPECTED_IDENTITY, name: "toonstudio-realtime-test" });
  });

  it.each(["../../../.env.example", "../../../.env.production.example"])(
    "%s의 API 발급 identity와 control URL을 Worker 계약에 맞춘다",
    (path) => {
      const environment = parseEnv(read(path));
      const apiIdentity = {
        issuer: environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER,
        audience: environment.STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE,
      };
      expect(apiIdentity).toEqual({
        issuer: EXPECTED_IDENTITY.issuer,
        audience: EXPECTED_IDENTITY.audience,
      });
      for (const configPath of PRODUCTION_CONFIGS) {
        expect(readRealtimeIdentity(parseWranglerJsonc(read(configPath)))).toMatchObject(apiIdentity);
      }
      expect(environment.STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL)
        .toBe("https://realtime.toonstudio.cloud/v1/control/revocations");
      expect(environment.STUDIO_REALTIME_TICKET_ENABLED).toBe("false");
      expect(environment.STUDIO_REALTIME_REVOCATION_ENABLED).toBe("false");
    },
  );
});

describe("Wrangler JSONC guard 회귀", () => {
  it("DO binding이 먼저 나와도 최상위 name만 읽는다", () => {
    const { name, ...rest } = parseWranglerJsonc(read("../wrangler.jsonc"));
    const reordered = parseWranglerJsonc(JSON.stringify({ ...rest, name }));
    expect(readRealtimeIdentity(reordered).name).toBe(EXPECTED_IDENTITY.name);
    expectProductionContract(reordered);
    const wrong = parseWranglerJsonc(JSON.stringify({ ...rest, name: "toonstudio-realtime-WRONG" }));
    expect(readRealtimeIdentity(wrong).name).toBe("toonstudio-realtime-WRONG");
    expect(() => expectProductionContract(wrong)).toThrow();
  });

  it("주석의 가짜 identity를 무시한다", () => {
    const comments = `// "name": "wrong-worker"
// "REALTIME_TICKET_ISSUER": "wrong-issuer"
/* "REALTIME_TICKET_AUDIENCE": "wrong-audience" */
`;
    expectProductionContract(parseWranglerJsonc(comments + read("../wrangler.jsonc")));
  });

  it("문자열의 URL·주석 기호·이스케이프와 trailing comma를 보존한다", () => {
    const config = parseWranglerJsonc(read("../wrangler.jsonc"));
    const note = 'https://example.test/path//segment/*literal*/?quote="name"';
    const source = JSON.stringify({ ...config, vars: { ...config.vars, NOTE: note } });
    const parsed = parseWranglerJsonc(`${source.slice(0, -1)},}`);
    expect(parsed.vars?.NOTE).toBe(note);
    expectProductionContract(parsed);
  });

  it.each(['{"name":', '/* 닫히지 않은 주석', '{"name": "worker" "vars": {}}'])(
    "손상된 JSONC %s를 거부한다",
    (source) => { expect(() => parseWranglerJsonc(source)).toThrow(); },
  );

  describe.each(["name", "REALTIME_TICKET_ISSUER", "REALTIME_TICKET_AUDIENCE"])("%s", (field) => {
    it.each([undefined, "", "   ", null, false, 42])("누락·빈 값·잘못된 타입 %s를 개별 거부한다", (value) => {
      expect(() => readRealtimeIdentity(mutatedIdentity(field, value))).toThrow();
    });

    it("배포용과 예제가 동시에 같은 오답으로 바뀌어도 거부한다", () => {
      const live = mutatedIdentity(field, "wrong-identity");
      const example = mutatedIdentity(field, "wrong-identity");
      expect(readRealtimeIdentity(live)).toEqual(readRealtimeIdentity(example));
      expect(() => expectProductionContract(live)).toThrow();
      expect(() => expectProductionContract(example)).toThrow();
    });
  });

  it.each(["workers_dev", "preview_urls", "routes"])("%s가 주석에만 있고 실제 설정에서 빠지면 거부한다", (field) => {
    const config = parseWranglerJsonc(read("../wrangler.jsonc"));
    const source = `// "workers_dev": true, "preview_urls": false
// "routes": [{"pattern":"realtime.toonstudio.cloud","custom_domain":true}]
${JSON.stringify({ ...config, [field]: undefined })}`;
    expect(() => expectProductionContract(parseWranglerJsonc(source))).toThrow();
  });
});
