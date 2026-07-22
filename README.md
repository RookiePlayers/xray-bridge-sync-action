# Xray Sync Action

Automatically run your tests and sync results to Jira/Xray after every push or PR.
Supports Jest, Mocha, Pest (PHP), and Pytest.

This action runs your test suite, extracts `@xray_plan` / `@xray_folder` /
`@jira_parent` tags from your test files, and posts the results to a
[xray-sync-service](https://github.com/RookiePlayers/test_case_xray) instance
you control, which creates/updates a Jira Test Execution.

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

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `xray_service_url` | Yes | — | URL of your deployed xray-sync-service |
| `reporter` | No | from `.xray-sync.yml` | `jest`, `mocha`, `pest`, or `pytest` |
| `config_path` | No | `.xray-sync.yml` | Path to config file |
| `working_directory` | No | `.` | Directory to run tests in |

## Outputs

| Output | Description |
|---|---|
| `execution_key` | Jira key of the created/updated Test Execution |
| `overall_status` | `PASS` or `FAIL` |

## Tagging test files

Add these comments within the first 20 lines of a test file:

```js
// @xray_plan DTV-33
// @xray_folder /Authentication/Login
// @jira_parent DTV-15
describe('Login endpoint', () => { /* ... */ })
```

Python/PHP files use `#` comments instead of `//`.

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
2. It scans the test files referenced in those results for `@xray_plan` /
   `@xray_folder` / `@jira_parent` tags.
3. It posts the raw results plus the extracted tag map to
   `${xray_service_url}/xray/sync-results`.
4. The service creates or updates a Jira Test Execution and returns the
   execution key and overall status, which are set as action outputs and
   written to the job summary.
5. If the test run itself failed, the action fails the job after syncing —
   so you still get the Xray execution link even on failure.
