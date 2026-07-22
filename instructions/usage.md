# Xray Sync Service — Consumer Usage Guide

This guide covers how to integrate any project with the Xray Sync Service to automatically sync test results to Jira/Xray after every pipeline run.

---

## Prerequisites — do these in Jira BEFORE setting up the pipeline

1. **The Fix Version must already exist.** Go to your Jira project → **Project Settings → Versions** → **Create version**. The name must match `fix_version` in `.xray-sync.yml` exactly (case-sensitive).
2. **The Xray Test Case(s) must already exist** for each test file you want to track. Use the `createTests` service to create them, or create manually in Jira. Note the Jira key (e.g. `DTV-32`) for tagging.
3. **The Xray Test Plan must already exist** if you're using `@xray_plan` to link to one. Use the `createTestPlan` service or create manually.

Without these existing first, the sync will either fail outright (invalid Fix Version) or silently skip files (no matching test case found).

---

## Setup

### 1. Add the workflow file

Drop `test-and-sync.yml` into:

```
.github/workflows/test-and-sync.yml
```

### 2. Add the tag extraction script

Drop `extract-tags.js` into:

```
.github/scripts/extract-tags.js
```

This script reads the list of test files from your Jest results, opens each file, and pulls out any `@xray_plan` / `@xray_folder` / `@jira_parent` tags from the first 20 lines. It runs **inside the GitHub Actions runner** (not on the deployed service) because the runner is the only place with access to your repo's actual file contents.

### 3. Add the config file

Drop `.xray-sync.yml` into the repo root and configure it:

```yaml
project_key: DTV
fix_version: v1.0
reporter: jest
execution_mode: per_run
test_results_path: ./test-results.json
```

### 4. Add the GitHub secret

In your repo go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `XRAY_SERVICE_URL` | `https://xray-sync-service-166488387568.europe-west2.run.app` |

### 5. Tag your test files

At the top of each test file add:

```typescript
// @xray_plan DTV-33
// @xray_folder /Authentication/Login
// @jira_parent DTV-15

describe('Login endpoint', () => {
  ...
})
```

| Tag | Required | Description |
|---|---|---|
| `@xray_plan` | ✅ | Jira key of the Test Plan this file belongs to. Without this the file is skipped entirely — you'll see a warning like `No @xray_plan tag found in <path> — skipping`. |
| `@xray_folder` | ❌ | Folder path in the Xray Test Repository. If omitted, test is synced without folder assignment. |
| `@jira_parent` | ❌ | Jira story this test covers. Currently extracted but **not yet acted on** — no issue link is created yet (planned). |

> ⚠️ A tag pointing at a Jira key that doesn't exist, or a test case that hasn't been created in Xray yet, will also cause the file to be skipped with a warning rather than fail the whole run.

### 6. Make sure Jest outputs JSON

In your `package.json`:

```json
{
  "scripts": {
    "test": "jest --forceExit --testTimeout 20000 --outputFile=./test-results.json --json"
  }
}
```

> Don't also pass `--json --outputFile` again from the workflow step if it's already in your `package.json` script — this can cause conflicts. Pick one place to define it.

---

## Config Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `project_key` | ✅ | — | Jira project key e.g. `DTV` |
| `fix_version` | ✅ | — | Fix version to group executions under e.g. `v1.0`. **Must already exist in Jira.** |
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
  → Runs .github/scripts/extract-tags.js
      → Reads each test file's first 20 lines
      → Builds a tag map: { filePath: { xrayPlan, xrayFolder, jiraParent } }
  → POSTs results + tag map to xray-sync-service
  → Service parses Jest results
  → Merges in tags from the tag map (no filesystem access needed on the service side)
  → Finds or creates a Test Execution for the fixVersion
  → For each tagged file, resolves @xray_plan to a real Xray test case
  → Updates that test run with PASS/FAIL + failure details
  → Files without a valid @xray_plan tag are skipped with a warning
  → Job summary shows Execution key and overall status
```

**Why tag extraction happens in the Action, not the service:** the Xray Sync Service runs on Cloud Run and has no access to your repo's files. Only the GitHub Actions runner — which just checked out your code — can read the actual test file contents. So tags are extracted there and shipped to the service inside the request payload.

---

## Test Run Comments

When a tagged test file is successfully synced, the service writes a comment to the Xray test run with:

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

## Current Limitations

- **`@jira_parent` linking is not yet implemented.** The tag is extracted and passed through, but no Jira issue link or coverage update happens with it yet.
- **Test cases must be created manually (or via the `createTests` service) before tagging.** The sync does not auto-create missing Xray test cases — it only updates existing ones.
- **Untagged files are silently skipped**, not failed. The overall pipeline can show ✅ PASS even if most files were skipped due to missing tags — check the `warnings` array in the response / Action logs to see what was actually synced.

---

## Supported Reporters

| Reporter | Status |
|---|---|
| Jest | ✅ Supported |
| Mocha | 🔜 Coming soon |
| Pytest | 🔜 Coming soon |
| Pest (PHP) | 🔜 Coming soon |

---

## Workflow Trigger Branches

The workflow triggers on push or PR to `main` and `develop` by default. To change this, edit the `on:` section of `test-and-sync.yml` directly (the `vars` context is not supported in `on:` — branches must be hardcoded here):

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

**Test file is skipped with `No @xray_plan tag found ... — skipping`**
The tag is missing from the file, or it's beyond the first 20 lines. Add it near the top of the file.

**Xray sync step fails with `fixVersions: Version name '...' is not valid`**
The Fix Version named in `.xray-sync.yml` doesn't exist in the Jira project yet. Create it under **Project Settings → Versions** first.

**`.github/scripts/extract-tags.js not found`**
The script wasn't copied into the consumer repo, or it's at the wrong path. It must be at exactly `.github/scripts/extract-tags.js`.

**Xray sync step fails with exit code 3 in the `curl`/`jq` step**
Almost always means `XRAY_SERVICE_URL` secret is empty or missing — check it's added under **Settings → Secrets and variables → Actions** as a **secret**, not a variable.

**HTTP 500: `Cannot read properties of undefined (reading 'filter')`**
This was a Jest version field-name mismatch (older parser expected `testFilePath`/`testResults`, newer Jest uses `name`/`assertionResults`). Fixed in the current `jestParser.ts` — make sure your deployed service is on the latest version.

**Execution created but `updatedRuns` is empty**
Check the `warnings` array in the response — it will list every file that was skipped and why, usually a missing/unresolvable `@xray_plan` tag.

**Jest JSON output not found**
Make sure Jest is run with `--json --outputFile=<test_results_path>` and the path in `.xray-sync.yml` matches exactly.
