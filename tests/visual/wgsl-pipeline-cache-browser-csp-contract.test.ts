import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  WGSL_PIPELINE_CACHE_BOOTSTRAP_ORDER,
  WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY,
  WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION,
  WGSL_PIPELINE_CACHE_WEBGPU_ARGS,
  actualBrowserCommandLineIsJitSafe,
  createWgslPipelineCacheCspBootstrapSource,
  validateWgslPipelineCacheArtifact,
} from "../benchmarks/harness/wgsl-pipeline-cache-browser";

const ORCHESTRATOR_URL = new URL("../benchmarks/harness/wgsl-pipeline-cache-browser.ts",
  import.meta.url,
);
const PAGE_URL = new URL("../benchmarks/harness/wgsl-pipeline-cache-browser-page.ts",
  import.meta.url,
);
const RESULT_URL = new URL("../benchmarks/results/wgsl-pipeline-cache.json",
  import.meta.url,
);

type MutableRecord = Record<string, unknown>;

function mutableRecord(value: unknown): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected a mutable record");
  }
  return value as MutableRecord;
}

function readArtifact(): MutableRecord {
  return JSON.parse(readFileSync(RESULT_URL, "utf8")) as MutableRecord;
}

function mutatedIssues(mutator: (artifact: MutableRecord) => void): readonly string[] {
  const artifact = structuredClone(readArtifact());
  mutator(artifact);
  return validateWgslPipelineCacheArtifact(artifact);
}

describe("WGSL pipeline-cache strict-CSP browser contract", () => {
  it("uses a dependency-free bootstrap as the sole HTML entry and preserves source order", () => {
    const orchestrator = readFileSync(ORCHESTRATOR_URL, "utf8");
    const page = readFileSync(PAGE_URL, "utf8");
    const bootstrap = createWgslPipelineCacheCspBootstrapSource();

    expect(orchestrator).toContain(
      '<script type="module" src="/bootstrap.ts"></script>',
    );
    expect(orchestrator).not.toContain(
      '<script type="module" src="/entry.ts"></script>',
    );
    expect(bootstrap).not.toMatch(/^\s*import(?:\s|\{)/mu);
    expect(bootstrap).toContain('await import("./entry.ts")');

    const listener = bootstrap.indexOf(
      'document.addEventListener("securitypolicyviolation"',
    );
    const jitless = bootstrap.indexOf("zodConfig.jitless = true");
    const dynamicImport = bootstrap.indexOf('await import("./entry.ts")');
    expect(listener).toBeGreaterThanOrEqual(0);
    expect(listener).toBeLessThan(jitless);
    expect(jitless).toBeLessThan(dynamicImport);

    expect(page.indexOf('order.push("page-module-evaluated")')).toBeLessThan(
      page.indexOf("async function run()"),
    );
    expect(page).toContain("zodCore.globalConfig.jitless === true");
    expect(page).toContain("zodCore.util.allowsEval.value");
    expect(page).toContain('new Function("return 1")');
  });

  it("mutates the existing Zod realm config without replacing other properties", () => {
    const existingConfig = { customError: "preserved", jitless: false };
    let securityListener: ((event: unknown) => void) | null = null;
    const context: MutableRecord = {
      __zod_globalConfig: existingConfig,
      document: {
        addEventListener: (name: string, listener: (event: unknown) => void) => {
          expect(name).toBe("securitypolicyviolation");
          securityListener = listener;
        },
      },
    };
    const executable = createWgslPipelineCacheCspBootstrapSource().replace(
      'await import("./entry.ts");',
      "globalThis.__entryImported = true;",
    );

    runInNewContext(executable, context);

    expect(context.__zod_globalConfig).toBe(existingConfig);
    expect(existingConfig).toEqual({ customError: "preserved", jitless: true });
    expect(securityListener).toBeTypeOf("function");
    expect(context.__entryImported).toBe(true);
    const receipt = mutableRecord(
      context.__TOONSPECTRUM_WGSL_PIPELINE_CACHE_BOOTSTRAP_RECEIPT__,
    );
    expect(receipt.order).toEqual(WGSL_PIPELINE_CACHE_BOOTSTRAP_ORDER.slice(0, 3));
  });

  it("pins the clean schema-v2 artifact, exact CSP, runtime receipt, and diagnostics", () => {
    const artifact = readArtifact();
    const benchmark = mutableRecord(artifact.benchmark);
    const diagnostics = mutableRecord(artifact.diagnostics);
    const headers = mutableRecord(diagnostics.responseHeaders);
    const positiveControl = mutableRecord(artifact.cspPositiveControl);

    expect(validateWgslPipelineCacheArtifact(artifact)).toEqual([]);
    expect(artifact).toMatchObject({
      schemaVersion: WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION,
      status: "pass",
      pass: true,
      validationIssues: [],
    });
    expect(benchmark.schemaVersion).toBe(WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION);
    expect(benchmark.cspViolations).toEqual([]);
    expect(benchmark.bootstrapReceipt).toMatchObject({
      schemaVersion: 1,
      order: WGSL_PIPELINE_CACHE_BOOTSTRAP_ORDER,
      listenerInstalledBeforeZodConfig: true,
      listenerInstalledBeforeEntryImport: true,
      zodJitlessConfiguredBeforeEntryImport: true,
      pageModuleEvaluated: true,
      zodGlobalConfigObservedByPage: true,
      zodCoreGlobalConfigJitless: true,
      zodAllowsEvalValue: false,
    });
    expect(diagnostics.cspViolations).toEqual([]);
    expect(actualBrowserCommandLineIsJitSafe(
      diagnostics.actualBrowserCommandLine,
    )).toBe(true);
    for (const argument of WGSL_PIPELINE_CACHE_WEBGPU_ARGS) {
      expect(diagnostics.actualBrowserCommandLine).toContain(argument);
    }
    expect(positiveControl).toMatchObject({
      freshContext: true,
      sameStrictCsp: true,
      attempted: true,
      blocked: true,
      errorName: "EvalError",
      violationCount: 1,
      observedPatterns: ["script-src: eval"],
      responseContentSecurityPolicy: WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY,
    });
    expect(positiveControl.bootstrapReceipt).toEqual(
      benchmark.bootstrapReceipt,
    );
    expect(headers.contentSecurityPolicy).toBe(
      WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY,
    );
    expect(headers.contentSecurityPolicy).toContain("script-src 'self'");
    expect(headers.contentSecurityPolicy).not.toContain("unsafe-eval");
    expect(headers.contentSecurityPolicy).not.toContain("unsafe-inline");
  });

  it("rejects direct, case-variant, combined, and --js-flags JIT-disable argv", () => {
    const forbiddenArgv = [
      ["/Chromium", "--jitless"],
      ["/Chromium", "--DISABLE-JIT"],
      ["/Chromium", "--no-jit"],
      ["/Chromium", "--NO-OPT"],
      ["/Chromium", "--no-turbofan"],
      ["/Chromium", "--trace-gc,--JITLESS,--foo"],
      ["/Chromium", "--js-flags=--jitless"],
      ["/Chromium", "--js-flags=--trace-gc,--NO-OPT,--foo"],
      ["/Chromium", '--js-flags="--foo --No-TurboFan"'],
      ["/Chromium", "--js-flags", "--disable-jit"],
    ];
    expect(actualBrowserCommandLineIsJitSafe(["/Chromium", "--trace-gc"]))
      .toBe(true);
    for (const argv of forbiddenArgv) {
      expect(actualBrowserCommandLineIsJitSafe(argv), JSON.stringify(argv))
        .toBe(false);
    }

    const missingIssues = mutatedIssues((artifact) => {
      mutableRecord(artifact.diagnostics).actualBrowserCommandLine = [];
    });
    expect(missingIssues).toContain(
      "actual Chromium argv is missing or disables the browser JIT",
    );

    const jsFlagsIssues = mutatedIssues((artifact) => {
      const diagnostics = mutableRecord(artifact.diagnostics);
      diagnostics.actualBrowserCommandLine = [
        ...(diagnostics.actualBrowserCommandLine as string[]),
        "--js-flags=--trace-gc,--JITLESS",
      ];
    });
    expect(jsFlagsIssues).toContain(
      "actual Chromium argv is missing or disables the browser JIT",
    );
  });

  it("rejects source-order and Zod runtime receipt mutations", () => {
    const orderIssues = mutatedIssues((artifact) => {
      const benchmark = mutableRecord(artifact.benchmark);
      const receipt = mutableRecord(benchmark.bootstrapReceipt);
      receipt.order = [
        "zod-jitless-configured",
        "csp-listener-installed",
        "entry-import-started",
        "page-module-evaluated",
      ];
    });
    expect(orderIssues).toContain(
      "bootstrap order or Zod strict-CSP runtime receipt is invalid",
    );

    const runtimeIssues = mutatedIssues((artifact) => {
      const benchmark = mutableRecord(artifact.benchmark);
      const receipt = mutableRecord(benchmark.bootstrapReceipt);
      receipt.zodCoreGlobalConfigJitless = false;
      receipt.zodAllowsEvalValue = true;
    });
    expect(runtimeIssues).toContain(
      "bootstrap order or Zod strict-CSP runtime receipt is invalid",
    );
  });

  it("rejects weakened CSP and incomplete or non-string diagnostics", () => {
    const cspIssues = mutatedIssues((artifact) => {
      const diagnostics = mutableRecord(artifact.diagnostics);
      const headers = mutableRecord(diagnostics.responseHeaders);
      headers.contentSecurityPolicy = `${WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY}; script-src 'self' 'unsafe-eval'`;
    });
    expect(cspIssues).toContain(
      "production build, exact CSP, or hardware WebGPU receipt is incomplete",
    );

    const diagnosticIssues = mutatedIssues((artifact) => {
      const diagnostics = mutableRecord(artifact.diagnostics);
      diagnostics.consoleWarnings = [7];
      diagnostics.cspViolations = [7];
      mutableRecord(artifact.benchmark).cspViolations = [7];
    });
    expect(diagnosticIssues).toContain(
      "browser diagnostics must be complete string arrays",
    );
    expect(diagnosticIssues).toContain(
      "CSP violations are missing, non-string, or suppressed",
    );
  });

  it("quarantines observed CSP events and rejects suppression or a false pass verdict", () => {
    const falsePassIssues = mutatedIssues((artifact) => {
      const violation = "script-src: eval";
      mutableRecord(artifact.diagnostics).cspViolations = [violation];
      mutableRecord(artifact.benchmark).cspViolations = [violation];
    });
    expect(falsePassIssues).toContain(
      "strict-CSP violations quarantine this browser evidence",
    );
    expect(falsePassIssues).toContain(
      "top-level WGSL pipeline cache artifact verdict is invalid",
    );

    const suppressedIssues = mutatedIssues((artifact) => {
      mutableRecord(artifact.benchmark).cspViolations = ["script-src: eval"];
      mutableRecord(artifact.diagnostics).cspViolations = [];
    });
    expect(suppressedIssues).toContain(
      "CSP violations are missing, non-string, or suppressed",
    );

    const cleanFalseVerdict = mutatedIssues((artifact) => {
      artifact.status = "quarantined";
      artifact.pass = false;
    });
    expect(cleanFalseVerdict).toContain(
      "top-level WGSL pipeline cache artifact verdict is invalid",
    );
  });

  it("rejects a missing or tampered fresh-context CSP positive control", () => {
    const missingIssues = mutatedIssues((artifact) => {
      artifact.cspPositiveControl = null;
    });
    expect(missingIssues).toContain(
      "fresh-context strict-CSP positive control is missing or invalid",
    );

    for (const mutate of [
      (control: MutableRecord) => {
        control.freshContext = false;
      },
      (control: MutableRecord) => {
        control.blocked = false;
      },
      (control: MutableRecord) => {
        control.errorName = "TypeError";
      },
      (control: MutableRecord) => {
        control.observedPatterns = [];
        control.violationCount = 0;
      },
      (control: MutableRecord) => {
        control.responseContentSecurityPolicy = "script-src 'self' 'unsafe-eval'";
      },
    ]) {
      const issues = mutatedIssues((artifact) => {
        mutate(mutableRecord(artifact.cspPositiveControl));
      });
      expect(issues).toContain(
        "fresh-context strict-CSP positive control is missing or invalid",
      );
    }
  });
});
