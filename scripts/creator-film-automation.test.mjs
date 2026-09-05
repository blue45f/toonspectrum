import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const workflow = JSON.parse(readFileSync("automation/n8n/toonstudio-brand-film.json", "utf8"));
const node = (name) => workflow.nodes.find((entry) => entry.name === name);
const executeCode = (name, input) => vm.runInNewContext(`(function () { ${node(name).parameters.jsCode} })()`, { $input: { first: () => ({ json: input }) } }, { timeout: 1000 });

test("n8n export is inactive, manually triggered, and has no credential material", () => {
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.filter((entry) => entry.type.includes("Trigger")).length, 1);
  assert(workflow.nodes.some((entry) => entry.type === "n8n-nodes-base.manualTrigger"));
  assert(workflow.nodes.every((entry) => !Object.hasOwn(entry, "credentials")));
  assert(workflow.nodes.every((entry) => !/webhook|executeCommand/i.test(entry.type)));
});
test("format validation allows only the four supported renditions", () => {
  for (const format of ["all", "landscape", "portrait", "square"]) {
    const result = executeCode("Validate render request", { format });
    assert.equal(result[0].json.format, format);
    assert.equal(result[0].json.ref, "main");
  }
  for (const format of [undefined, "", "../../main", "all; curl attacker.invalid", "gif", {}, ["all"]]) {
    assert.throws(() => executeCode("Validate render request", { format }), /Unsupported format/);
  }
});
test("dispatch is authenticated, fixed destination, no automatic duplicate retries", () => {
  const dispatch = node("Dispatch approved GitHub renderer");
  assert.equal(dispatch.parameters.authentication, "predefinedCredentialType");
  assert.equal(dispatch.parameters.nodeCredentialType, "githubApi");
  assert.equal(dispatch.parameters.url, "https://api.github.com/repos/blue45f/toonspectrum/actions/workflows/creator-brand-film.yml/dispatches");
  assert.equal(dispatch.retryOnFail, false);
  assert(!dispatch.parameters.options.response.response.neverError);
});
test("accepted response never claims rendering or publication completed", () => {
  const accepted = executeCode("Return accepted not completed", { statusCode: 204 })[0].json;
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.renderingComplete, false);
  assert.equal(accepted.published, false);
  for (const statusCode of [200, 202, 401, 403, 404, 429, 500]) assert.throws(() => executeCode("Return accepted not completed", { statusCode }), /not accepted/);
});
test("every edge targets an existing node and the renderer cannot publish", () => {
  const names = new Set(workflow.nodes.map((entry) => entry.name));
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert(names.has(source));
    for (const list of outputs.main) for (const edge of list) assert(names.has(edge.node));
  }
  const renderWorkflow = readFileSync(".github/workflows/creator-brand-film.yml", "utf8");
  assert(renderWorkflow.includes("contents: read"));
  assert(!/contents: write|git push|secrets\./.test(renderWorkflow));
  assert(renderWorkflow.includes('"$FILM_FORMAT"'));
});
