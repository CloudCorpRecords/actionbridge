import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  apiBaseFromEnv,
  describeActionInputs,
  executeAction,
  extractActions,
  getAction,
  getExecutionResult,
  listActionApps,
  listActions,
  searchActions,
  tokenFromEnv,
  validateActionParams,
} from "../src/zapier.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Recorded { url: string; method: string; headers: Record<string, string>; body: unknown; }

function fakeFetch(steps: Array<{ match: string; payload: unknown; status?: number; rawText?: string }>) {
  const calls: Recorded[] = [];
  const fn: FetchFn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
    const step = steps.find((s) => url.includes(s.match)) ?? { match: "", payload: {} };
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => step.rawText ?? JSON.stringify(step.payload),
    };
    return res;
  };
  return { fn, calls };
}

const BASE = "https://nla.zapier.com/api/v1";
const TOKEN = "zap-key";

const ACTIONS = [
  { id: "a1", name: "Send Email", app: "Gmail", description: "Send an email message", params: { to: { type: "string" }, subject: { type: "string" } } },
  { id: 42, name: "Create Row", app: "Google Sheets", description: "Add a spreadsheet row", params: [{ key: "spreadsheet" }, { name: "worksheet" }] },
  { id: "a3", name: "Post Message", app_name: "Slack", description: "Post to a channel" },
  { id: "a4", name: "Send Email Copy", app: "Gmail", description: "Another email helper" },
];

describe("actionbridge core", () => {
  it("names the env var when the key is missing", () => {
    assert.throws(() => tokenFromEnv({}), /ZAPIER_API_KEY environment variable is required/);
    assert.equal(tokenFromEnv({ ZAPIER_API_KEY: " x " }), "x");
  });

  it("base defaults, overrides and trims trailing slashes", () => {
    assert.equal(apiBaseFromEnv({}), "https://nla.zapier.com/api/v1");
    assert.equal(apiBaseFromEnv({ ZAPIER_API_BASE_URL: "https://example.test/v1///" }), "https://example.test/v1");
    assert.equal(apiBaseFromEnv({ ZAPIER_API_BASE_URL: "  " }), "https://nla.zapier.com/api/v1");
  });

  it("list_actions gets /exposed/ with Bearer and Accept headers and returns payload as-is", async () => {
    const { fn, calls } = fakeFetch([{ match: "/exposed/", payload: { actions: ACTIONS } }]);
    const out = await listActions(fn, TOKEN, BASE, {});
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://nla.zapier.com/api/v1/exposed/");
    assert.equal(calls[0].headers.Authorization, "Bearer zap-key");
    assert.equal(calls[0].headers.Accept, "application/json");
    assert.deepEqual(out, { actions: ACTIONS });
  });

  it("extractActions handles array, actions and results envelopes and falls back to []", () => {
    assert.deepEqual(extractActions(ACTIONS), ACTIONS);
    assert.deepEqual(extractActions({ actions: ACTIONS }), ACTIONS);
    assert.deepEqual(extractActions({ results: ACTIONS }), ACTIONS);
    assert.deepEqual(extractActions({ nope: 1 }), []);
    assert.deepEqual(extractActions(null), []);
  });

  it("search_actions filters case-insensitively over name, app and description", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    const byApp = (await searchActions(fn, TOKEN, BASE, { query: "gmail" })) as { query: string; count: number; actions: unknown[] };
    assert.equal(byApp.query, "gmail");
    assert.equal(byApp.count, 2);
    const byDesc = (await searchActions(fn, TOKEN, BASE, { query: "SPREADSHEET" })) as { count: number; actions: Array<{ id: unknown }> };
    assert.equal(byDesc.count, 1);
    assert.equal(byDesc.actions[0].id, 42);
    const byName = (await searchActions(fn, TOKEN, BASE, { query: "post message" })) as { count: number };
    assert.equal(byName.count, 1);
    const none = (await searchActions(fn, TOKEN, BASE, { query: "zzz" })) as { count: number; actions: unknown[] };
    assert.deepEqual(none, { query: "zzz", count: 0, actions: [] });
  });

  it("get_action gets /exposed/{id}/ with trailing slash", async () => {
    const { fn, calls } = fakeFetch([{ match: "/exposed/a1/", payload: { id: "a1" } }]);
    const out = await getAction(fn, TOKEN, BASE, { action_id: "a1" });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://nla.zapier.com/api/v1/exposed/a1/");
    assert.deepEqual(out, { id: "a1" });
  });

  it("execute_action posts {instructions, params} to /exposed/{id}/execute/", async () => {
    const { fn, calls } = fakeFetch([{ match: "/execute/", payload: { execution_id: "e1" } }]);
    await executeAction(fn, TOKEN, BASE, { action_id: "a1", instructions: "Send it", params: { to: "a@example.test" } });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://nla.zapier.com/api/v1/exposed/a1/execute/");
    assert.deepEqual(calls[0].body, { instructions: "Send it", params: { to: "a@example.test" } });
  });

  it("execute_action defaults params to {}", async () => {
    const { fn, calls } = fakeFetch([{ match: "/execute/", payload: {} }]);
    await executeAction(fn, TOKEN, BASE, { action_id: "a1", instructions: "Do it" });
    assert.deepEqual(calls[0].body, { instructions: "Do it", params: {} });
  });

  it("list_action_apps returns distinct sorted app names including app_name fallback", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: { actions: ACTIONS } }]);
    const out = await listActionApps(fn, TOKEN, BASE, {});
    assert.deepEqual(out, { count: 3, apps: ["Gmail", "Google Sheets", "Slack"] });
  });

  it("describe_action_inputs returns declared params for a found action (string id match)", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    const out = await describeActionInputs(fn, TOKEN, BASE, { action_id: "42" }) as Record<string, unknown>;
    assert.equal(out.action_id, "42");
    assert.equal(out.name, "Create Row");
    assert.deepEqual(out.params, [{ key: "spreadsheet" }, { name: "worksheet" }]);
    const out2 = await describeActionInputs(fn, TOKEN, BASE, { action_id: "a3" }) as Record<string, unknown>;
    assert.equal(out2.params, null);
  });

  it("describe_action_inputs throws a not-found error naming the id", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    await assert.rejects(() => describeActionInputs(fn, TOKEN, BASE, { action_id: "nope" }), /action not found among exposed actions: nope/);
  });

  it("validate_action_params computes missing and unknown for object-shaped declarations", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    const out = await validateActionParams(fn, TOKEN, BASE, { action_id: "a1", params: { to: "x", extra: 1 } });
    assert.deepEqual(out, { action_id: "a1", valid: false, missing: ["subject"], unknown: ["extra"] });
    const ok = await validateActionParams(fn, TOKEN, BASE, { action_id: "a1", params: { to: "x", subject: "s" } });
    assert.deepEqual(ok, { action_id: "a1", valid: true, missing: [], unknown: [] });
  });

  it("validate_action_params computes missing and unknown for array-shaped declarations", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    const out = await validateActionParams(fn, TOKEN, BASE, { action_id: "42", params: { spreadsheet: "s", bogus: 1 } });
    assert.deepEqual(out, { action_id: "42", valid: false, missing: ["worksheet"], unknown: ["bogus"] });
  });

  it("validate_action_params returns the no-schema note when nothing is declared", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    const out = await validateActionParams(fn, TOKEN, BASE, { action_id: "a3", params: { anything: 1 } });
    assert.deepEqual(out, { action_id: "a3", valid: true, missing: [], unknown: [], note: "action declares no parameter schema to validate against" });
  });

  it("validate_action_params throws a not-found error naming the id", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: ACTIONS }]);
    await assert.rejects(() => validateActionParams(fn, TOKEN, BASE, { action_id: "nope", params: {} }), /action not found among exposed actions: nope/);
  });

  it("get_execution_result gets /execution-log/{id}/", async () => {
    const { fn, calls } = fakeFetch([{ match: "/execution-log/e9/", payload: { id: "e9", status: "success" } }]);
    const out = await getExecutionResult(fn, TOKEN, BASE, { execution_id: "e9" });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://nla.zapier.com/api/v1/execution-log/e9/");
    assert.deepEqual(out, { id: "e9", status: "success" });
  });

  it("surfaces upstream error status and message", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: { message: "invalid api key" }, status: 401 }]);
    await assert.rejects(() => listActions(fn, TOKEN, BASE, {}), /Zapier API error 401: invalid api key/);
  });

  it("returns {status} for an empty successful body", async () => {
    const { fn } = fakeFetch([{ match: "/exposed/", payload: null, rawText: "", status: 200 }]);
    const out = (await listActions(fn, TOKEN, BASE, {})) as Record<string, unknown>;
    assert.deepEqual(out, { status: 200 });
  });
});
