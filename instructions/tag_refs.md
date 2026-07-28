# Xray Tag Reference

Add these comment tags to a test file to connect it to the Xray sync pipeline.
`@xray_plan` / `@xray_folder` / `@jira_parent` go at the very top, before any
imports. `@xray_test` can go at the top too (whole-file mode) OR directly
above each `it()`/`test()` block (per-block mode) — see below.

---

## Tag Summary

| Tag | Required | Value | Purpose |
|---|---|---|---|
| `@xray_test` | **Yes** | Xray Test issue key (e.g. `DTV-47`) | Drives individual test run status updates (PASS/FAIL) under the Test Execution |
| `@xray_plan` | No | Test Plan issue key (e.g. `DTV-149`) | Links the Test Execution to this Test Plan so results appear under its "Test Executions" tab |
| `@xray_folder` | No | Folder path (e.g. `/Auth/Login`) | Places the test in the correct Xray Test Repository folder |
| `@jira_parent` | No | Jira story/feature key (e.g. `DTV-42`) | Creates a "Tests" issue link on the parent story when test status changes |

---

## Two modes for `@xray_test`

**Whole-file mode — exactly one `@xray_test` tag in the file.**
Every `it()`/`test()` block in the file counts toward that one Xray Test's pass/fail.

```javascript
// @xray_test DTV-47
// @xray_plan DTV-149
// @xray_folder /Auth/Login
// @jira_parent DTV-42

import { login } from '../services/auth';

describe('Login endpoint', () => {
  it('should return 200 for valid credentials', ...)
  it('should return 401 for invalid credentials', ...)
})
```

**Per-block mode — two or more `@xray_test` tags in the file.**
Each tag must sit directly above the specific `it()`/`test()` call it applies to
(within a few lines — blank lines and other comments are fine, but not another
`it()`/`test()` in between). That block's own pass/fail syncs independently to
that Test. Blocks with no tag directly above them are simply not synced — no
warning is raised for them.

```javascript
// @xray_plan DTV-149
// @xray_folder /Auth/Login
// @jira_parent DTV-42

describe('Login endpoint', () => {
  // @xray_test DTV-47
  it('should return 200 for valid credentials', ...)

  // @xray_test DTV-48
  it('should return 401 for invalid credentials', ...)

  it('should log the attempt either way', ...) // not tagged — not synced
})
```

Use per-block mode whenever a file covers more than one distinct Xray Test
case. Use whole-file mode only when the entire file really is one Test.

---

## What each tag does in the pipeline

**`@xray_test` (required)**
The pipeline finds the Xray Test issue with this key and updates its run status
(PASS or FAIL) under the Test Execution created for this pipeline run.
Without this tag the file is skipped entirely — no status is recorded.

**`@xray_plan` (optional)**
The pipeline finds the Test Plan with this key and links the Test Execution to it,
so the run appears under the Test Plan's "Test Executions" tab in Jira.
Failure to resolve this is non-fatal — logged as a warning, sync continues.
Only resolved once per sync run even if multiple files reference the same plan.

**`@xray_folder` (optional)**
Used by Claude Code when creating the Xray test case to place it in the
correct folder in the Xray Test Repository. Has no effect on the pipeline sync
itself — the folder placement is done at test case creation time, not at runtime.

**`@jira_parent` (optional)**
When the test status changes (e.g. first run, or PASS → FAIL), the pipeline
creates a "Tests" Jira issue link between this test and the parent story.
Only fires on status change, not on every run, to avoid noise.

---

## Common mistakes

**Using a Test Plan key as `@xray_test`:**
```javascript
// WRONG — DTV-149 is a Test Plan, not a Test
// @xray_test DTV-149
```
The pipeline queries Xray for a Test issue with this key. A Test Plan key
will fail to resolve and the file will be skipped with an error.

**Using a Test issue key as `@xray_plan`:**
```javascript
// WRONG — DTV-47 is a Test, not a Test Plan
// @xray_plan DTV-47
```
The pipeline will fail to link the Test Execution and log a warning.

**Missing `@xray_test` entirely:**
```javascript
// WRONG — file will be skipped, no status recorded
// @xray_plan DTV-149
// @xray_folder /Auth/Login
```
`@xray_test` is the only required tag. All others are optional.

**Multiple `@xray_test` tags, but not directly above their `it()`/`test()`:**
```javascript
// WRONG — tags are grouped at the top instead of per-block
// @xray_test DTV-47
// @xray_test DTV-48
describe('Login endpoint', () => {
  it('should return 200 for valid credentials', ...)
  it('should return 401 for invalid credentials', ...)
})
```
As soon as a file has 2+ `@xray_test` tags, each one must sit directly above
the specific block it applies to (see per-block mode above). Grouping them
together like this means DTV-47 binds to whichever `it()` comes first and
DTV-48 finds nothing to bind to — logged as a parse warning, not synced.

---

## How to get the right keys

**`@xray_test` key:**
Create a Test issue in Jira (or ask Claude Code: "create a test case for this feature"),
and use the returned issue key (e.g. DTV-47).

**`@xray_plan` key:**
Create a Test Plan in Jira (or ask Claude Code: "create a test plan for v1.0"),
and use the returned issue key (e.g. DTV-149).
Keep this key noted — reuse it for all test files belonging to the same version
rather than creating a new Test Plan per file.