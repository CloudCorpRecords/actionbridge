# actionbridge — BUILD REPORT

Original: zapier (Zapier) → Rebuild: actionbridge
Generic action-runner core. Local only, nothing pushed or published.

## SPECIAL CASE (read first)
Zapier's surface is thousands of per-app actions behind a hosted
per-user MCP endpoint; per-app action parity is NOT enumerable and
must NEVER be claimed. actionbridge implements a GENERIC
ACTION-RUNNER CORE (8 tools) over the documented Zapier
exposed-actions API shape (the NLA/exposed-actions API:
GET {base}/exposed/, POST {base}/exposed/{action_id}/execute/).
It is a generic runner over whatever actions the key's account has
exposed; it does not reproduce Zapier's hosted MCP endpoint, its
per-user URL/key embedding, or any specific app's action catalogue.

## Scope
8 tools against the Zapier exposed-actions API
(https://nla.zapier.com/api/v1, base overridable via
ZAPIER_API_BASE_URL), Authorization: Bearer ZAPIER_API_KEY with
`Accept: application/json` on every request, all HTTP behind an
injectable FetchFn:
list_actions (GET /exposed/, payload returned as-is; the helper
extractActions normalises array / {actions:[...]} / {results:[...]}
envelopes to an actions array for the client-side tools),
search_actions (GET /exposed/, client-side case-insensitive filter
over name/app/description, returns {query, count, actions}),
get_action (GET /exposed/{action_id}/, trailing slash),
execute_action (POST /exposed/{action_id}/execute/, body
{instructions, params} with params defaulting to {}),
list_action_apps (GET /exposed/, distinct sorted app names from
action.app ?? action.app_name, string values only),
describe_action_inputs (GET /exposed/, find by String(action.id),
return {action_id, name?, params: params ?? inputs ??
input_params ?? null}; not-found throws
"action not found among exposed actions: {action_id}"),
validate_action_params (real local logic: GET /exposed/, find the
action, compare provided keys against declared param names taken
from an object-shaped params (its keys) or an array of {key|name}
entries, return {action_id, valid, missing, unknown}; when the
action declares no params shape, return valid:true with the note
"action declares no parameter schema to validate against"),
get_execution_result (GET /execution-log/{execution_id}/,
docs-derived shape — flag as first check at live smoke).

Omitted (fixture `_source` lists them): every specific app's
action catalogue (by design, not enumerable), Zap/Zaps management,
folders, Zap history UI surfaces, app connections admin, and the
hosted MCP endpoint itself.

Ground truth: schemas are docs-derived from Zapier's documented
exposed-actions (NLA) API shape. Fixture:
harness/fixtures/zapier-tools-original.json (labelled generic
runner core). Parity proves this 8-tool core only.

## Verified (foreground, from disk)
- Tools: 8/8 — parity.json identical_tools = 8 = total.
- Unit tests: 18/18 pass (fake FetchFn; missing-key naming
  ZAPIER_API_KEY, base override/trim, list_actions payload as-is,
  extractActions array/actions/results envelopes, search_actions
  case-insensitive filter over name/app/description, get_action
  trailing-slash URL, execute_action body {instructions, params}
  with params default {}, list_action_apps distinct+sorted,
  describe_action_inputs found + not-found error,
  validate_action_params missing/unknown for object-shaped and
  array-shaped declarations + no-schema note path,
  get_execution_result URL, upstream error surfacing, empty-body
  {status} handling).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0; unknown command exits 2 with Usage.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Missing-env checks: CLI list_actions with ZAPIER_API_KEY unset
  → "error: ZAPIER_API_KEY environment variable is required",
  exit 1; stdio tools/call list_actions with the key unset returned
  isError "ZAPIER_API_KEY environment variable is required".
- server.json description 64 chars (≤100); OCI entry has no version
  field; npm entry carries version 0.1.0; Dockerfile label
  io.github.CloudCorpRecords/actionbridge; full 19-file factory set
  present.

## Honest gaps
- No live Zapier call was made — request/response behaviour is
  fake-fetch proven only.
- get_execution_result's /execution-log/{execution_id}/ shape is
  docs-derived; it is the first thing to check at live smoke.
- Per-app action parity is not claimed and cannot be claimed (see
  SPECIAL CASE above); only the generic runner core is proven.
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
