# Xray Sync Service — Consumer Usage Guide

This guide covers how to integrate any project with the Xray Sync Service to automatically sync test results to Jira/Xray after every pipeline run.

---

## Setup

### 1. Add the workflow file

Drop `test-and-sync.yml` into:

```
.github/workflows/test-and-sync.yml
```

### 2. Add the config file

Drop `.xray-sync.yml` into the repo root and configure it:

```yaml
project_key: DTV
fix_version: v1.0
reporter: jest
execution_mode: per_run
test_results_path: ./test-results.json
branch: main
trigger: on_merge
```

### 3. Add the GitHub secret

In your repo go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `XRAY_SERVICE_URL` | `https://xray-sync-service-166488387568.europe-west2.run.app` |

### 4. Tag your test files

At the top of each test file add:

```typescript
// @xray_plan DTV-149
// @xray_test DTV-33
// @xray_folder /Authentication/Login
// @jira_parent DTV-15

describe('Login endpoint', () => {
  ...
})
```

| Tag | Required | Description |
|---|---|---|
| `@xray_test` | ✅ | Jira key of the specific Xray Test this file's results map to. Without this the file is skipped entirely. |
| `@xray_plan` | ❌ | Jira key of the Test Plan this test belongs to. When present, the Test Execution created/reused for this sync run is linked to that Test Plan. If the key doesn't resolve to a real Test Plan, this is logged as a warning and the rest of the sync still proceeds. |
| `@xray_folder` | ❌ | Folder path in the Xray Test Repository. If omitted, test is synced without folder assignment. |
| `@jira_parent` | ❌ | Jira story this test covers. When a test's pass/fail status changes from its last synced state, a Jira issue link (Xray's "Tests" link type) is created between the test and the parent issue. This only fires on a status change, not on every pipeline run, to avoid redundant link operations. If omitted, no issue link is created but everything else works normally. |

### 5. Make sure Jest outputs JSON

In your `package.json` update your test script:

```json
{
  "scripts": {
    "test": "jest --json --outputFile=./test-results.json"
  }
}
```

Or in `jest.config.ts`:

```typescript
export default {
  reporters: [
    'default',
    ['jest-junit', { outputFile: './test-results.json' }]
  ]
}
```

---

## Config Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `project_key` | ✅ | — | Jira project key e.g. `DTV` |
| `fix_version` | ✅ | — | Fix version to group executions under e.g. `v1.0` |
| `reporter` | ✅ | `jest` | Test reporter format. Supported: `jest` |
| `execution_mode` | ❌ | `per_run` | `per_run` — one execution per pipeline run. `per_file` — one execution per test file. |
| `test_results_path` | ❌ | `./test-results.json` | Path to Jest JSON output relative to repo root |
| `branch` | ❌ | `main` | Branch that triggers the sync (informational) |
| `trigger` | ❌ | `on_merge` | `on_commit` \| `on_merge` \| `on_pr` (informational) |

---

## How It Works

```
Push to main or develop
  → GitHub Actions runs Jest with --json
  → Reads .xray-sync.yml
  → POSTs results to xray-sync-service
  → Service parses results
  → Finds or creates a Test Execution for the fixVersion
  → Updates each test run with PASS/FAIL + failure details
  → Job summary shows Execution key and overall status
```

---

## Test Run Comments

When a test file is synced, the service writes a comment to the Xray test run with:

```
✅ 4 passed  ❌ 2 failed  ⏭ 0 skipped
⏱ Duration: 1.23s
🔗 Pipeline run: https://github.com/...

Failed tests:
• should return 401 for invalid credentials
  Expected: 401
  Received: 500
• should reject expired tokens
  Expected: 403
  Received: 200
```

---

## Supported Reporters

| Reporter | Status | Output format |
|---|---|---|
| Jest | ✅ Supported | `jest --json --outputFile=results.json` |
| Mocha | ✅ Supported | `mocha --reporter json > results.json` |
| Pytest | ✅ Supported | `pytest --junit-xml=results.xml` |
| Pest (PHP) | ✅ Supported | `./vendor/bin/pest --log-junit results.xml` |

Pest and Pytest both produce standard JUnit XML and share the same parser. Mocha outputs a flat JSON array (not grouped by file) — the parser groups by the `file` field automatically. Tag extraction for Pytest and Pest uses `extract-tags-junit.js` instead of `extract-tags.js`; see Step 6 in the [GitHub Actions workflow](.github/workflows/test-and-sync.yml) for details.

---

## Workflow Trigger Branches

The workflow triggers on push or PR to `main` and `develop` by default. To change this, edit the `on:` section of `test-and-sync.yml` directly:

```yaml
on:
  push:
    branches:
      - your-branch
  pull_request:
    branches:
      - your-branch
```

---

## Troubleshooting

**Test file is skipped with a warning**
The `@xray_plan` tag is missing or the Xray test key couldn't be resolved. Check the tag is at the top of the file and the key exists in Jira.

**Xray sync step fails with 401**
The `XRAY_SERVICE_URL` secret is missing or the deployed service credentials have expired. Check the secret value and the Secret Manager entries in GCP.

**Execution not found for fixVersion**
A new Test Execution will be created automatically. Make sure `fix_version` in `.xray-sync.yml` matches the version name exactly as it appears in Jira.

**Jest JSON output not found**
Make sure Jest is run with `--json --outputFile=<test_results_path>` and the path in `.xray-sync.yml` matches.