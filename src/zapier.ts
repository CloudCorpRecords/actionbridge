/**
 * actionbridge core: a generic action-runner core of 8 tools over
 * the documented Zapier exposed-actions API shape (the NLA /
 * exposed-actions API: GET {base}/exposed/,
 * POST {base}/exposed/{action_id}/execute/).
 *
 * SPECIAL CASE: Zapier's surface is thousands of per-app actions
 * behind a hosted per-user MCP endpoint; per-app action parity is
 * NOT enumerable and is NOT claimed. This is a generic runner over
 * whatever actions the key's account has exposed; it does not
 * reproduce Zapier's hosted MCP endpoint, its per-user URL/key
 * embedding, or any specific app's action catalogue.
 *
 * Base default https://nla.zapier.com/api/v1, overridable via
 * ZAPIER_API_BASE_URL. Auth: ZAPIER_API_KEY, sent as
 * `Authorization: Bearer` with `Accept: application/json` on every
 * request. A missing key is an error naming the variable. All HTTP
 * goes through an injected FetchFn so the wire behaviour is fully
 * testable offline.
 */
import type {
  ActionEntry,
  DescribeActionInputsOptions,
  ExecuteActionOptions,
  FetchFn,
  GetActionOptions,
  GetExecutionResultOptions,
  ListActionAppsOptions,
  ListActionsOptions,
  SearchActionsOptions,
  ValidateActionParamsOptions,
} from "./types.js";

export const VERSION = "0.1.0";
export const DEFAULT_API_BASE = "https://nla.zapier.com/api/v1";

export function tokenFromEnv(env: Record<string, string | undefined> = process.env): string {
  const raw = env.ZAPIER_API_KEY;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) throw new Error("ZAPIER_API_KEY environment variable is required");
  return token;
}

export function apiBaseFromEnv(env: Record<string, string | undefined> = process.env): string {
  const raw = env.ZAPIER_API_BASE_URL;
  const base = typeof raw === "string" ? raw.trim() : "";
  return (base || DEFAULT_API_BASE).replace(/\/+$/, "");
}

interface RequestSpec { method: string; path: string; body?: unknown; }

async function apiRequest(fetchFn: FetchFn, token: string, base: string, spec: RequestSpec): Promise<unknown> {
  const res = await fetchFn(`${base}${spec.path}`, {
    method: spec.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; detail?: string; errors?: Array<{ message?: string }> };
      const first = parsed.message ?? parsed.detail ?? parsed.errors?.[0]?.message;
      if (typeof first === "string") detail = first;
    } catch { /* keep raw */ }
    throw new Error(`Zapier API error ${res.status}: ${detail}`);
  }
  if (!text) return { status: res.status };
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

const enc = encodeURIComponent;

export function extractActions(payload: unknown): ActionEntry[] {
  if (Array.isArray(payload)) return payload as ActionEntry[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.actions)) return obj.actions as ActionEntry[];
    if (Array.isArray(obj.results)) return obj.results as ActionEntry[];
  }
  return [];
}

async function fetchExposed(fetchFn: FetchFn, token: string, base: string): Promise<unknown> {
  return apiRequest(fetchFn, token, base, { method: "GET", path: "/exposed/" });
}

function findAction(actions: ActionEntry[], actionId: string): ActionEntry | undefined {
  return actions.find((a) => a && String(a.id) === actionId);
}

export async function listActions(fetchFn: FetchFn, token: string, base: string, _opts: ListActionsOptions = {}): Promise<unknown> {
  return fetchExposed(fetchFn, token, base);
}

export async function searchActions(fetchFn: FetchFn, token: string, base: string, opts: SearchActionsOptions): Promise<unknown> {
  const payload = await fetchExposed(fetchFn, token, base);
  const actions = extractActions(payload);
  const needle = opts.query.toLowerCase();
  const filtered = actions.filter((action) => {
    const haystack = [action?.name, action?.app, action?.description]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => JSON.stringify(v))
      .join(" ");
    return haystack.toLowerCase().includes(needle);
  });
  return { query: opts.query, count: filtered.length, actions: filtered };
}

export async function getAction(fetchFn: FetchFn, token: string, base: string, opts: GetActionOptions): Promise<unknown> {
  return apiRequest(fetchFn, token, base, { method: "GET", path: `/exposed/${enc(opts.action_id)}/` });
}

export async function executeAction(fetchFn: FetchFn, token: string, base: string, opts: ExecuteActionOptions): Promise<unknown> {
  return apiRequest(fetchFn, token, base, {
    method: "POST",
    path: `/exposed/${enc(opts.action_id)}/execute/`,
    body: { instructions: opts.instructions, params: opts.params ?? {} },
  });
}

export async function listActionApps(fetchFn: FetchFn, token: string, base: string, _opts: ListActionAppsOptions = {}): Promise<unknown> {
  const payload = await fetchExposed(fetchFn, token, base);
  const actions = extractActions(payload);
  const names = new Set<string>();
  for (const action of actions) {
    const app = action?.app ?? action?.app_name;
    if (typeof app === "string" && app) names.add(app);
  }
  const apps = [...names].sort();
  return { count: apps.length, apps };
}

export async function describeActionInputs(fetchFn: FetchFn, token: string, base: string, opts: DescribeActionInputsOptions): Promise<unknown> {
  const payload = await fetchExposed(fetchFn, token, base);
  const actions = extractActions(payload);
  const action = findAction(actions, opts.action_id);
  if (!action) throw new Error(`action not found among exposed actions: ${opts.action_id}`);
  const out: Record<string, unknown> = {
    action_id: opts.action_id,
    params: action.params ?? action.inputs ?? action.input_params ?? null,
  };
  if (action.name !== undefined) out.name = action.name;
  // Keep a stable shape: {action_id, name?, params}
  const ordered: Record<string, unknown> = { action_id: out.action_id };
  if ("name" in out) ordered.name = out.name;
  ordered.params = out.params;
  return ordered;
}

export async function validateActionParams(fetchFn: FetchFn, token: string, base: string, opts: ValidateActionParamsOptions): Promise<unknown> {
  const payload = await fetchExposed(fetchFn, token, base);
  const actions = extractActions(payload);
  const action = findAction(actions, opts.action_id);
  if (!action) throw new Error(`action not found among exposed actions: ${opts.action_id}`);
  const declaredRaw = action.params ?? action.inputs ?? action.input_params;
  let declared: string[] | null = null;
  if (Array.isArray(declaredRaw)) {
    declared = [];
    for (const entry of declaredRaw as Array<Record<string, unknown>>) {
      if (entry && typeof entry === "object") {
        const key = entry.key ?? entry.name;
        if (typeof key === "string") declared.push(key);
      } else if (typeof entry === "string") {
        declared.push(entry);
      }
    }
  } else if (declaredRaw && typeof declaredRaw === "object") {
    declared = Object.keys(declaredRaw as Record<string, unknown>);
  }
  if (!declared) {
    return { action_id: opts.action_id, valid: true, missing: [], unknown: [], note: "action declares no parameter schema to validate against" };
  }
  const provided = Object.keys(opts.params ?? {});
  const missing = declared.filter((name) => !provided.includes(name));
  const unknown = provided.filter((name) => !declared.includes(name));
  return { action_id: opts.action_id, valid: missing.length === 0 && unknown.length === 0, missing, unknown };
}

export async function getExecutionResult(fetchFn: FetchFn, token: string, base: string, opts: GetExecutionResultOptions): Promise<unknown> {
  return apiRequest(fetchFn, token, base, { method: "GET", path: `/execution-log/${enc(opts.execution_id)}/` });
}

export async function callTool(fetchFn: FetchFn, token: string, base: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "list_actions": return listActions(fetchFn, token, base, args as unknown as ListActionsOptions);
    case "search_actions": return searchActions(fetchFn, token, base, args as unknown as SearchActionsOptions);
    case "get_action": return getAction(fetchFn, token, base, args as unknown as GetActionOptions);
    case "execute_action": return executeAction(fetchFn, token, base, args as unknown as ExecuteActionOptions);
    case "list_action_apps": return listActionApps(fetchFn, token, base, args as unknown as ListActionAppsOptions);
    case "describe_action_inputs": return describeActionInputs(fetchFn, token, base, args as unknown as DescribeActionInputsOptions);
    case "validate_action_params": return validateActionParams(fetchFn, token, base, args as unknown as ValidateActionParamsOptions);
    case "get_execution_result": return getExecutionResult(fetchFn, token, base, args as unknown as GetExecutionResultOptions);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
