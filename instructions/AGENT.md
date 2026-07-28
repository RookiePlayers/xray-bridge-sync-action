# Xray Test Generation

When asked to write tests for a feature, follow this process exactly.

---

## Step 1 — Understand the existing test structure

Before writing a single line of test code, examine the repo:

1. Find the test directory — look for `test/`, `tests/`, `__tests__/`, or `*.test.*` / `*.spec.*` files anywhere in the project
2. Read at least 2-3 existing test files to understand:
   - The test framework and runner being used (Jest, Mocha, Pest, Pytest, etc.)
   - Import/require style
   - How the subject under test is imported
   - Mocking approach (jest.mock, sinon, unittest.mock, etc.)
   - How setup/teardown is handled (beforeEach, setUp, fixtures, etc.)
   - Assertion style (expect, assert, should, etc.)
   - Any shared test utilities or helpers being imported
   - Naming conventions for test files and describe/it blocks
3. If NO existing tests are found, use the standard conventions for the detected language and framework (Jest conventions for TypeScript/JavaScript, PHPUnit/Pest conventions for PHP, pytest conventions for Python, etc.)

Do not invent a different style from what already exists in the project. Match it exactly.

---

## Step 2 — Understand the feature being tested

Read the feature code the user is asking you to test:

1. Identify what the code does — its inputs, outputs, side effects, and dependencies
2. Identify what needs mocking — external services, database calls, API clients, etc.
3. Identify the meaningful test cases:
   - Happy path (valid input, expected output)
   - Edge cases (empty input, boundary values, optional fields missing)
   - Error cases (invalid input, dependency failures, unauthorised access)
4. Do not write trivial tests that only check that a function exists or returns something non-null — every test case should verify meaningful behaviour

---

## Step 3 — Resolve fix version and Test Plan

Read `.xray-sync.yml` if it exists in the repo root. Extract `project_key` and `fix_version`.

**Fix version:**
- If `fix_version` is present in `.xray-sync.yml`, use it without asking
- If it is missing or `.xray-sync.yml` does not exist, ask the user:
  > "What fix version should these tests be linked to? (e.g. v1.0)"

**Test Plan:**
- Search the current conversation context for any previously mentioned Test Plan key (e.g. DTV-149)
- If a Test Plan key is known, use it — do not ask again
- If no Test Plan key is known, call `create_test_plan` to create one automatically:
  - `summary`: "{project_key} {fix_version} Test Plan" (e.g. "DTV v1.0 Test Plan")
  - `projectKey`: from `.xray-sync.yml` or ask the user
  - `fixVersion`: resolved above
- Log the created Test Plan key clearly so the user can reference it in future sessions:
  > "Created Test Plan: DTV-149 — use this key in future sessions to avoid creating duplicates."

---

## Step 4 — Determine the correct folder location

1. Look at the existing test directory structure to understand how tests are organised (by feature area, by module, by endpoint, by layer, etc.)
2. Infer the correct folder for the new test based on where similar tests live
3. If no clear pattern exists, ask the user: "Where would you like this test file to go?"
4. Check whether the corresponding Xray folder already exists — if not, call `create_folder` to create it
5. This folder path is also what you will use as the `@xray_folder` tag value

---

## Step 5 — Create the Xray test case(s) FIRST, then write the test file

Unlike the other steps, the Xray test case(s) must be created BEFORE writing the file
so the returned issue key(s) can be embedded as `@xray_test` tag(s).

First decide which of the two tagging modes fits the feature (see Step 6 for full
details on each mode's tag placement):

- **Whole-file mode (default)** — the test cases identified in Step 2 are variations
  of one behaviour and read naturally as steps of a single manual Test (e.g. "tax rate
  resolution" with 3 steps: valid rate, missing rate, invalid rate). Create ONE Xray
  Test with multiple steps.
- **Per-block mode** — the test cases identified in Step 2 are independently meaningful
  scenarios that a QA engineer would want to track and report on separately in Xray
  (e.g. distinct API behaviours, distinct endpoints, distinct business rules bundled
  in one file for code-organisation reasons only). Create one Xray Test PER scenario.
  Use this whenever you're unsure which mode fits better — it gives finer-grained
  Xray reporting at no extra cost.

**Whole-file mode:**

1. Call `create_test` with:
   - `summary`: a clear title describing what this test file covers (e.g. "Payment — tax rate resolution")
   - `projectKey`: from `.xray-sync.yml` or ask the user
   - `testType`: "Manual"
   - `steps`: one step per meaningful test case identified in Step 2, using:
     - `action`: what the test does (e.g. "Call resolveTaxForRate with a valid rate")
     - `data`: the input being used
     - `result`: the expected outcome

2. Note the returned `issueKey` (e.g. DTV-47) — this becomes the single `@xray_test` tag value

3. Call `add_to_test_plan` with:
   - `testPlanKey`: the Test Plan key from Step 3
   - `testIssueIds`: the issueId returned from `create_test`

4. If the Xray folder from Step 4 was just created or may not exist, call `add_tests_to_folder` with:
   - `projectKey`: from config
   - `path`: the folder path from Step 4
   - `testIssueIds`: the issueId returned from `create_test`

**Per-block mode:**

1. Call `create_test` once PER scenario, each with its own `summary` (e.g. "Analytics — GA4 summary aggregation", "Analytics — GA4 request parameters"), `projectKey`, `testType: "Manual"`, and its own `steps` describing just that one scenario.

2. Note each returned `issueKey` (e.g. DTV-150, DTV-151) and which `it()`/`test()` block it corresponds to — you'll tag each block individually in Step 6.

3. Call `add_to_test_plan` once with `testIssueIds` containing ALL the issueIds from step 1, so every Test lands in the same Test Plan.

4. If the Xray folder from Step 4 was just created or may not exist, call `add_tests_to_folder` once with all the issueIds from step 1.

---

## Step 6 — Write the test file

Create the test file in the correct location. `@xray_plan` / `@xray_folder` / `@jira_parent`
always go at the very top of the file, before any imports — they apply to the whole file
regardless of tagging mode. Where `@xray_test` goes depends on which mode you chose in Step 5:

**Whole-file mode** — `@xray_test` also goes at the top, alongside the other tags:

```
// @xray_test <issue-key-from-step-5>      ← REQUIRED — Xray Test issue key (e.g. DTV-47)
// @xray_plan <test-plan-key-from-step-3>  ← optional — Test Plan key (e.g. DTV-149)
// @xray_folder <folder-from-step-4>       ← optional — Xray folder path (e.g. /Auth/Login)
// @jira_parent <feature-issue-key>        ← optional — parent Jira story (e.g. DTV-42)
```

**Per-block mode** — `@xray_test` goes directly above EACH `it()`/`test()` call it applies to
(no blank `it()`/`test()` call in between — blank lines and other comments are fine). Any
`it()`/`test()` in the file with no `@xray_test` directly above it is simply not synced —
only tag the blocks you created a Test for in Step 5:

```
// @xray_plan <test-plan-key-from-step-3>
// @xray_folder <folder-from-step-4>
// @jira_parent <feature-issue-key>

describe('...', () => {
  // @xray_test <issue-key-for-scenario-1>
  it('...', () => { ... });

  // @xray_test <issue-key-for-scenario-2>
  it('...', () => { ... });
});
```

**Critical tag semantics — never confuse these:**
- `@xray_test` → the Xray **Test** issue key. REQUIRED (at least one per file). The pipeline
  uses this to update that test's run status (PASSED/FAILED) under the Test Execution. A file
  with zero `@xray_test` tags is skipped entirely — no status is ever recorded. A block with
  no `@xray_test` tag directly above it (in per-block mode) is simply not synced.
- `@xray_plan` → the Xray **Test Plan** issue key. Optional. The pipeline links the
  Test Execution to this plan so results appear under the Test Plan's "Test Executions" tab.
- `@xray_folder` → Xray Test Repository folder path. Optional.
- `@jira_parent` → parent Jira story/feature. Optional. A "Tests" link is created when
  test status changes.

Never use a Test Plan key as `@xray_test`. Never use a Test issue key as `@xray_plan`.
These are different issue types in Jira — using the wrong key causes the sync to fail silently.

In per-block mode, never group multiple `@xray_test` tags together at the top of the file —
each one MUST sit directly above its own `it()`/`test()` call, or it will bind to the wrong
block (or nothing) and the mismatch is only caught as a parse warning, not an error.

For `@jira_parent`, use the Jira issue key for the feature/story this test covers if the
user has mentioned it, or ask:
> "What is the Jira issue key for this feature? (e.g. DTV-42)"

Then write the full test file body, matching the conventions discovered in Step 1 exactly.

---

## Step 7 — Tell the user what to do next

```
Test file created: <path>

Tags applied:
  @xray_test    <test-issue-key>   ← drives individual test status updates
  @xray_plan    <test-plan-key>    ← links Test Execution to this plan
  @xray_folder  <folder-path>
  @jira_parent  <feature-key>

Xray test case: <test-issue-key> added to Test Plan <test-plan-key>

Next steps:
1. Review the generated test file and adjust if needed
2. Push to your branch — the pipeline runs tests automatically
3. Results sync to Jira:
   - Individual status appears under <test-issue-key>
   - Test Execution appears under <test-plan-key>'s "Test Executions" tab
```

---

## Important rules

- Never skip Step 1 — always read existing tests before writing new ones
- Never hardcode a testing framework — detect it from the project
- Never write the test file without @xray_test — always create the Xray test case first
  so the real issue key is available to embed in the file header
- Never confuse @xray_test (Test issue key) with @xray_plan (Test Plan key)
- Never create a duplicate Test Plan — check whether one was already mentioned in
  this session first
- Never ask for fix_version if it is already in `.xray-sync.yml`
- If the MCP tools are not available, write the test file with placeholder tags and
  tell the user to:
  1. Connect the Xray MCP connector at https://xray-sync-service-166488387568.europe-west2.run.app/account
  2. Then ask Claude Code to run Steps 5–6 again to create the Xray test case and
     replace the placeholder tags with real issue keys
- If the user says "just write the tests" without Xray context, write the file first
  with placeholder tags and handle Xray setup afterward — never block test generation
  on Xray setup