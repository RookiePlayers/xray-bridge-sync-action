# Xray Sync Action

Automatically run your tests and sync results to Jira/Xray after every push or PR.
Supports Jest, Mocha, Pest (PHP), and Pytest.

This action runs your test suite, extracts `@xray_test` / `@xray_plan` /
`@xray_folder` / `@jira_parent` tags from your test files, and posts the
results to a [xray-sync-service](https://github.com/RookiePlayers/test_case_xray)
instance you control, which creates/updates a Jira Test Execution.

## Usage

Add a `.xray-sync.yml` to your repo root:

```yaml
project_key: DTV
fix_version: v1.0
reporter: jest
execution_mode: per_run
test_results_path: ./test-results.json
```

Add a workflow file (e.g. `.github/workflows/test-and-sync.yml`):

```yaml
name: Test & Sync to Xray

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test-and-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: RookiePlayers/xray-sync-action@v1
        with:
          xray_service_url: ${{ secrets.XRAY_SERVICE_URL }}
```

Add `XRAY_SERVICE_URL` as a repository secret pointing at your deployed
xray-sync-service instance.

### Explicit credentials (no session-based Xray connection)

xray-sync-service normally resolves the Xray/Jira credentials to use via a
per-user session established at `/connect/xray`. CI runs have no such
session, so without any credential inputs the service falls back to its own
environment credentials — which may belong to a different Jira site/project
than the one this repo's `.xray-sync.yml` targets, and fails with an opaque
Xray error like `No project could be found with key 'DTV'`.

To avoid that, pass the credentials explicitly as action inputs. They mirror
the same fields you'd fill in at `/connect/xray`, so reuse the same values:

```yaml
      - uses: actions/checkout@v4
      - uses: RookiePlayers/xray-sync-action@v1
        with:
          xray_service_url: ${{ secrets.XRAY_SERVICE_URL }}
          xray_client_id: ${{ secrets.XRAY_CLIENT_ID }}
          xray_client_secret: ${{ secrets.XRAY_CLIENT_SECRET }}
          jira_base_url: ${{ secrets.JIRA_BASE_URL }}
          jira_email: ${{ secrets.JIRA_EMAIL }}
          jira_api_token: ${{ secrets.JIRA_API_TOKEN }}
```

These five are all-or-nothing — set all of them or none. The service
validates that `jira_email`/`jira_api_token` can actually see the
`project_key` from `.xray-sync.yml` on `jira_base_url` before calling Xray,
so a copy-pasted secret from the wrong Jira site fails with a clear
"these credentials don't have access to project X on site Y" error instead
of Xray's raw "project not found".

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `xray_service_url` | Yes | — | URL of your deployed xray-sync-service |
| `reporter` | No | from `.xray-sync.yml` | `jest`, `mocha`, `pest`, or `pytest` |
| `config_path` | No | `.xray-sync.yml` | Path to config file |
| `working_directory` | No | `.` | Directory to run tests in |
| `xray_client_id` | No | — | Xray Cloud API Client ID. See [Explicit credentials](#explicit-credentials-no-session-based-xray-connection) — required together with the four fields below, or omit all five to use the service's session/env-based resolution |
| `xray_client_secret` | No | — | Xray Cloud API Client Secret, paired with `xray_client_id` |
| `jira_base_url` | No | — | Jira site these credentials belong to, e.g. `https://yourcompany.atlassian.net` |
| `jira_email` | No | — | Email of the Jira account associated with `jira_api_token` |
| `jira_api_token` | No | — | Jira API token for `jira_email` |

## Outputs

| Output | Description |
|---|---|
| `execution_key` | Jira key of the created/updated Test Execution |
| `overall_status` | `PASSED` or `FAILED` |

## Tagging test files

```js
// @xray_plan DTV-149
// @xray_folder /Authentication/Login
// @jira_parent DTV-15

describe('Login endpoint', () => {
  // @xray_test DTV-33
  it('returns 200 for valid credentials', () => { /* ... */ });

  // @xray_test DTV-34
  it('returns 401 for invalid credentials', () => { /* ... */ });
});
```

| Tag | Required | Description |
|---|---|---|
| `@xray_test` | **Yes** | Jira key of the Xray Test this maps to. Without at least one of these in the file, the file is skipped — no test run gets created or updated in Xray. One tag anywhere in the file = whole-file aggregate; 2+ tags = per-block mode, where each tag must sit directly above the `it()`/`test()` call it applies to. |
| `@xray_plan` | No | Jira key of the Test Plan this test belongs to |
| `@xray_folder` | No | Folder path to file the test under in the Xray repository |
| `@jira_parent` | No | Jira issue to link this test to |

Python/PHP files use `#` comments instead of `//`. See [instructions/tag_refs.md](instructions/tag_refs.md) for the full reference, including both tagging modes.

## .xray-sync.yml reference

| Field | Description |
|---|---|
| `project_key` | Jira project key (e.g. `DTV`) |
| `fix_version` | Fix version in Jira that executions are grouped under |
| `reporter` | `jest`, `mocha`, `pest`, or `pytest` |
| `execution_mode` | `per_run` (default) or `per_file` |
| `test_results_path` | Path the test results are written to (JSON for Jest/Mocha, JUnit XML for Pest/Pytest) |

## How it works

1. The action reads `.xray-sync.yml` and runs your test suite with the
   configured reporter, writing results to `test_results_path`.
2. It scans the test files referenced in those results for `@xray_test` /
   `@xray_plan` / `@xray_folder` / `@jira_parent` tags.
3. It posts the raw results plus the extracted tag map to
   `${xray_service_url}/xray/sync-results` — including the `xray_client_id`/
   `jira_*` inputs as `credentials` in the request body, if provided.
4. The service creates or updates a Jira Test Execution and returns the
   execution key and overall status, which are set as action outputs and
   written to the job summary.
5. If the test run itself failed, the action fails the job after syncing —
   so you still get the Xray execution link even on failure.
