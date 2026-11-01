/**
 * actionbridge types.
 *
 * SPECIAL CASE: Zapier's surface is thousands of per-app actions
 * behind a hosted per-user MCP endpoint; per-app action parity is
 * NOT enumerable. actionbridge is a generic action-runner core over
 * the documented Zapier exposed-actions API shape. Action entries
 * are untyped JSON returned by that API, described here with
 * optional unknown-ish fields.
 *
 * HTTP access is described by a minimal response surface so tests
 * can inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

export interface ActionEntry {
  id?: unknown;
  name?: unknown;
  app?: unknown;
  app_name?: unknown;
  description?: unknown;
  params?: unknown;
  inputs?: unknown;
  input_params?: unknown;
  [key: string]: unknown;
}

export interface ListActionsOptions {}
export interface SearchActionsOptions { query: string; }
export interface GetActionOptions { action_id: string; }
export interface ExecuteActionOptions { action_id: string; instructions: string; params?: Record<string, unknown>; }
export interface ListActionAppsOptions {}
export interface DescribeActionInputsOptions { action_id: string; }
export interface ValidateActionParamsOptions { action_id: string; params: Record<string, unknown>; }
export interface GetExecutionResultOptions { execution_id: string; }
