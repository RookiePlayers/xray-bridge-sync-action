# Xray Test Generation

When asked to write tests for a feature, follow this process exactly. When asked to fix,
update, reorder, or delete Xray Tests that already exist, skip to **Modifying existing
tests** below instead.

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
3. Identify the meaningful test cases — be thorough here, not just illustrative. Cover
   every success path, every failure path, and every edge case the code actually has, not
   just one representative example of each:
   - Happy path — every distinct valid input/output combination the code supports, not
     just a single "it works" case (e.g. if a function branches on 3 valid input shapes,
     that's 3 happy-path cases, not 1)
   - Edge cases — empty input, boundary values (min/max, zero, off-by-one), optional
     fields missing, unusual-but-valid input
   - Error/failure cases — every distinct way the code can fail: invalid input, each
     validation rule that can reject it, dependency/network failures, unauthorised access,
     timeouts, and any error branch visible in the code
   Look at the actual branches, conditionals, and validation rules in the code being
   tested — if the code has an `if`/`else`, a `switch`, a validation check, or a try/catch,
   each branch is its own test case. Skipping a branch because it "seems similar enough"
   to one already covered is not acceptable; a test suite that only exercises the happy
   path and one generic failure is not thorough enough to ship.
4. Classify each test case as one of:
   - **`unit`** — tests a single function/module in isolation, all external dependencies mocked
   - **`integration`** — exercises a real boundary: an API route (request → response), a
     database read/write, or a UI interaction/render. If a test hits an HTTP endpoint,
     queries/asserts against a database, or drives a UI, it's `integration`, not `unit`,
     even if it also happens to live in the same file as unit tests. Note which shape it
     is (API, DB, or UI) — Step 5 drafts the Xray action differently for each.
   This classification is used in Step 6 to decide which test cases get an Xray Test
   created — do not skip it even if Xray sync isn't being discussed yet.
5. **Writing UI integration tests.** When a test case is `integration`/UI, apply this
   shape when writing the actual test code (this is about the code, not the Xray wording
   — Step 5 covers how the Xray action reads):
   - **Start from a realistic state.** Render the actual page or feature with routing,
     state management, and other real integrations intact. Mock only boundaries you don't
     control — usually the backend/network, payments, third-party SDKs.
   - **Interact like a user.** Prefer `getByRole`, labels, and visible text; click buttons,
     type into fields, navigate. Avoid selecting by CSS class, internal component name, or
     `data-testid` unless there's genuinely no better option.
   - **Assert the outcome, not the mechanics.** Don't test that `setState()` was called or
     that a particular child component rendered. Test that the user sees "Saved
     successfully," gets redirected, sees a validation error, or sees the updated value.
   - **One meaningful workflow per test.** E.g. "Given an existing customer → when I edit
     their email and save → then the correct API request is sent and the new email appears
     in the UI." Don't bundle unrelated workflows into one test.
   - **Include failure paths, not just the happy path.** Loading states, validation
     errors, server errors, permission failures, empty states, and retries are usually the
     highest-value UI integration tests — cover them as their own test cases in Step 2,
     same as any other failure branch.
   - **The refactor test:** if the internal component structure were refactored without
     changing what the user experiences, the test should still pass. If a test would break
     from a purely internal refactor, it's testing implementation, not behaviour — rewrite it.
   - **Keep the test pyramid in mind** when deciding what becomes a UI integration test vs.
     a unit test vs. an E2E test: unit tests should cover edge-case logic cheaply and in
     volume; UI integration tests should cover a smaller number of important workflows
     thoroughly; full E2E tests are reserved for only the most critical journeys. Don't
     push edge-case logic coverage into UI integration tests just because the feature has a
     UI — that belongs in unit tests on the underlying logic.
6. Do not write trivial tests that only check that a function exists or returns something non-null — every test case should verify meaningful behaviour

---

## Step 3 — Resolve fix version and Test Plan

Read `.xray-sync.yml` if it exists in the repo root. Extract `project_key`, `fix_version`,
`xray_tagging_mode`, and `xray_ignore_test_types` (if present).

**Ignored test types:**
- `xray_ignore_test_types` is a list containing zero or more of `unit`, `integration`
  (e.g. `xray_ignore_test_types: [unit]`).
- Any test case classified in Step 2 as one of the listed types is excluded from Xray
  entirely — no `create_test` call is ever made for it, no issue key exists for it, and
  it gets no `@xray_test` tag in Step 7. It is still written into the test file and still
  runs normally; it simply isn't represented in Jira/Xray at all. This filtering is
  actually applied in Step 5, but the setting itself is read here.
- If `xray_ignore_test_types` is absent or empty, every test case is eligible for Xray
  sync as before — nothing changes.
- This is a config-only setting — never ask the user which types to ignore, and never
  infer an ignore list from conversation. If they want this behaviour, it belongs in
  `.xray-sync.yml`.

**Fix version:**
- Always ask the user which fix version these tests should be linked to, even if `fix_version` is present in `.xray-sync.yml`:
  > "What fix version should these tests be linked to? (`.xray-sync.yml` has `<fix_version>` — use that, or a different one?)"
- If `.xray-sync.yml` does not exist or has no `fix_version`, ask without the config hint:
  > "What fix version should these tests be linked to? (e.g. v1.0)"
- Use whatever the user confirms or provides — never proceed on the config value alone without asking.

**Test Plan:**
- Search the current conversation context for any previously mentioned Test Plan key (e.g. PROJ-149)
- If a Test Plan key is known, confirm it with the user before reusing it:
  > "Should these tests go into the existing Test Plan PROJ-149, or a different one?"
- If no Test Plan key is known, ask the user for one before creating anything:
  > "What Test Plan should these tests be linked to? Give me an existing key (e.g. PROJ-149), or say 'create one' and I'll set up a new Test Plan named '{project_key} {fix_version} Test Plan'."
- Only call `create_test_plan` if the user explicitly asks for a new one to be created. Never create a Test Plan automatically just because none was found in context.
  - `summary`: "{project_key} {fix_version} Test Plan" (e.g. "PROJ v1.0 Test Plan")
  - `projectKey`: from `.xray-sync.yml` or ask the user
  - `fixVersion`: resolved above
- Log the created Test Plan key clearly so the user can reference it in future sessions:
  > "Created Test Plan: PROJ-149 — use this key in future sessions to avoid creating duplicates."

---

## Step 4 — Determine the correct folder location

1. Look at the existing test directory structure to understand how tests are organised (by feature area, by module, by endpoint, by layer, etc.)
2. Split by feature first, then by test type: `tests/{feature_name}/unit/...` for unit
   test cases and `tests/{feature_name}/integration/...` for integration test cases
   (API/DB/UI), e.g. `src/<feature>/<module>.ts` → `tests/<feature>/unit/<module>.test.ts`
   and `tests/<feature>/integration/<module>.test.ts`. If a file's test cases in Step 2
   span both types, they belong in two separate files, one per type-folder under the same
   feature folder — check the existing repo structure first, and only fall back to this
   default if no existing `tests/{feature}/unit` / `tests/{feature}/integration` split is
   already in use (match whatever convention already exists over this default).
3. Within the feature's `unit` or `integration` folder, infer the correct sub-folder based on where similar tests live
4. If no clear pattern exists, ask the user: "Where would you like this test file to go?"
5. Check whether the corresponding Xray folder already exists — if not, call `create_folder` to create it
6. This folder path is also what you will use as the `@xray_folder` tag value

---

## Step 5 — Draft the test plan and review it with the user

Nothing touches Jira/Xray in this step — it's entirely about composing the plan and
getting explicit sign-off before Step 6 makes any `create_test` calls. `update_test` can
fix most mistakes after the fact (see **Modifying existing tests** below), but it's still
cheaper to get the draft right upfront than to patch a multi-step Test one field at a time
afterward — and `reorder_test_steps` refuses to run if any step has attachments or calls
another test, so a wrong step order isn't always fixable in place. Confirm before
anything is created.

**1. Apply `xray_ignore_test_types` from Step 3.** Split the test cases identified in
Step 2 into two groups:
- **Synced** — test cases whose type is NOT in `xray_ignore_test_types`. Only these are
  eligible to get an Xray Test drafted below.
- **Excluded** — test cases whose type IS in `xray_ignore_test_types`. These never get a
  `create_test` call, never get an issue key, and never get an `@xray_test` tag. They
  still get written into the file in Step 7 exactly like any other test — they just have
  no Xray involvement at all.

If EVERY test case in the file falls into the excluded group (e.g. the whole file is
`unit` tests and `xray_ignore_test_types` contains `unit`), there is nothing to draft or
review for Xray — tell the user this file has no Xray-eligible test cases and skip ahead
to Step 7 to write it with no `@xray_test`, `@xray_plan`, `@xray_folder`, or
`@jira_parent` tags at all. This is the one case where the "never write without
`@xray_test`" rule does not apply, because there is legitimately nothing to sync.

Otherwise, continue below using only the **synced** group.

**2. Decide the tagging mode.**
- **Config takes priority.** If `xray_tagging_mode` was found in `.xray-sync.yml` in
  Step 3, use it directly — `whole-file` or `per-block` — and skip the judgment call
  below entirely. Do not override a configured mode based on how the test cases look.
- **No config value set — fall back to judgment:**
  - **Whole-file mode (default)** — the test cases are variations of one behaviour and
    read naturally as steps of a single manual Test (e.g. a function with 3 steps: valid
    input, missing input, invalid input). Draft ONE Xray Test with multiple steps.
  - **Per-block mode** — the test cases are independently meaningful scenarios a QA
    engineer would want to track and report on separately in Xray (e.g. distinct API
    behaviours, distinct endpoints, distinct business rules bundled in one file for
    code-organisation reasons only). Draft one Xray Test PER scenario. Use this whenever
    you're unsure which mode fits better — it gives finer-grained Xray reporting at no
    extra cost.
  - If judgment is used (no config value present), flag this to the user in the review
    below and mention that setting `xray_tagging_mode` in `.xray-sync.yml` will make it
    consistent going forward.

**3. Draft each Xray Test's `summary`, `description`, and `steps` (action/data/result).**

`description` always follows this three-part structure — never free-form prose, and
never just a restatement of the steps:
```
*Purpose:* <one sentence — the behaviour/requirement this Test guarantees>
*Scope:* <what's covered — which cases (valid/missing/invalid, success/failure/edge),
unit vs integration, and which boundaries are real vs mocked>
*Related:* <@jira_parent key if known, else "N/A">
```

**Action/data/result format for integration test cases.** Test cases classified as
`integration` in Step 2 must describe the manual reproduction of the scenario through
the relevant tool — an HTTP client (e.g. Postman) for API/DB tests, or the actual UI for
UI tests — not the code. A QA engineer reading the Xray Test should be able to follow it
by hand, without looking at the test file. `unit` test cases are unaffected and keep
describing the function call as before.

**This is the preferred, default format — use it unless the user explicitly asks for
flowing-paragraph prose instead.** Every step is one of two shapes:

- **Full numbered walkthrough** — for the step that actually performs a meaningfully
  different action (a new endpoint, a new payload shape, a new UI flow). For an API/DB
  case, `action` is a numbered, tool-level walkthrough:
  ```
  As a developer, I created a new HTTP request to <do the primary action>

  1. I open the HTTP client
  2. I create a new request
  3. I set the method to *<METHOD>* and URL to {{apiUrl}}/v1/<resource>
  4. I set Authorization to *Bearer Token*, using a token for a user with role *<role>*
  5. I fill out the request body
  6. I send the request
  ```
  Its `data` is a structured breakdown, not a flat list:
  ```
  *Request Type:* <METHOD>
  *URL:* {{apiUrl}}/v1/<resource>
  *Authorization:* Type: Bearer Token, Token: user with role <role>
  *Params JSON:*
  {code:json}
  { "<fieldA>": "<value>", "<fieldB>": "<value>", "<fieldC>": <value> }
  {code}
  *Pre-seeded:* {{<table_name>}} row for the relevant record: *<columnA>*=<value>,
  *<columnB>*=<value>
  ```
  For a UI case, `action` describes clicks/typing/navigation instead of a request:
  ```
  As a user, I edit an existing <entity>'s <field> and save the change

  1. I navigate to the <entity> page
  2. I click "Edit" on the <field> field
  3. I clear the field and type "<new value>"
  4. I click "Save"
  ```
  Its `data` lists the concrete starting state and input typed, not a request payload:
  ```
  *Starting state:* <entity> exists with *<field>*=<old value>
  *Input:* "<new value>" typed into the <field> field
  ```
- **Short one-liner** — for a variant/edge-case request or interaction that only differs
  from an earlier full-walkthrough step in payload/auth/headers/input, or for a step that
  only verifies state from an earlier step (no new request or interaction). Reference the
  earlier step number instead of re-describing the setup:
  ```
  Trying to send the same request from step 1, but with an *invalid <fieldA>* value.
  ```
  or, for UI:
  ```
  Same as step 1, but leaving the <field> field empty before clicking "Save".
  ```
  Its `data` states only the diff from that earlier step.

**`result`** always leads with the outcome, then a `*Database:*` section listing every
side effect — this applies to both shapes and both API and UI cases:
```
*Response:*
{code:json}
{ "success": true, "message": "<action> completed successfully.", "data": { "<idField>": "<new id>" } }
{code}

*Database:*
- {{<table_name>}}: new row (*<columnA>*=<value>, *<columnB>*=<value>)
- {{<other_table_name>}}: new row (*<columnC>*=<value>, *<columnD>* set)
```
For UI cases, `*Response:*` describes what the user sees, not internals — no "component
re-rendered" or "state updated," only what's visible:
```
*Response:*
I see a "Saved successfully" confirmation, and the <field> value on the page updates to
"<new value>" without a page reload.

*Database:*
- {{<table_name>}}: *<field>* updated to "<new value>" for the existing <entity>
```
For a rejected/failed request, `*Response:*` is the status and validation error instead
of a code block (e.g. `HTTP *422* validation error on {{<fieldA>}}`). For a UI failure
case, `*Response:*` states exactly what the user sees instead (e.g. `I see a "This field
is required" error under the <field> input, and the form does not submit`). Either way,
`*Database:*` states what was NOT created/changed (e.g. `No rows are created.`).

**Text formatting — apply throughout `description`/`action`/`data`/`result`, for every
test type:**
- **This project's Xray fields render Jira wiki markup, confirmed empirically** — NOT
  standard Markdown, regardless of whether the base Jira looks like Cloud or Server:
  bold is single asterisks (`*text*`, not `**text**`), inline monospace is double curly
  braces (`{{text}}`, not backtick fences), and code blocks are `{code:json}...{code}`
  (triple-backtick fences render as literal text — they do nothing). Do not re-derive
  this from asking the user which Jira edition they run; `**bold**` partially garbles
  under wiki markup's single-asterisk toggle instead of failing loudly, so a wrong guess
  looks almost-right and can slip by unnoticed (this happened once already — see the
  probe-test rule below, which is how it was ultimately caught and fixed).
- **Bold** important data: status codes, key field values, and words that change the
  meaning of a sentence (`*omitted*`, `*negative*`, `*failed*`, `*neither*`/`*nor*`).
- `{{Monospace}}` for field/column/table names, URLs, and other identifiers
  (`{{<fieldA>}}`, `{{<table_name>}}`, `{{apiUrl}}`).
- `{code:json}...{code}` blocks for any JSON payload or response snippet — never inline
  JSON in a sentence and never a flat `key=value` list.
- **Before drafting a multi-step Xray Test with any formatting syntax that hasn't been
  confirmed to render correctly in THIS Jira instance**, create a tiny one-step throwaway
  probe Test first (summary prefixed `FORMAT PROBE`, skip `add_to_test_plan`/
  `add_tests_to_folder` since it's disposable, and `delete_test` it once you're done with
  it), covering one example of each syntax element in use, and ask the user to screenshot
  how it rendered before committing to the full plan. `update_test`'s `stepUpdates` can
  patch formatting on individual steps afterward, but re-editing every step of a
  multi-step Test one at a time is slower than getting the syntax right upfront — so a
  cheap 1-step probe is still worth it whenever the syntax is unconfirmed for this Jira.

Never fall back to describing the HTTP client call in code terms (e.g. "call the endpoint
with axios") for an integration test case.

**4. Present the drafted plan to the user and get explicit approval before Step 6.**
Show, for each file to be created:
- The file path(s) from Step 4, and which test cases go in which file
- The tagging mode being used, and whether it came from config or judgment
- For each Xray Test to be created: its `summary`, full `description`
  (Purpose/Scope/Related), and each step's `action`/`data`/`result`
- Which test cases (if any) are excluded from Xray per `xray_ignore_test_types`, and why
- The Test Plan key and fix version this will be linked under (from Step 3)

Ask directly: "Does this look right, or would you like changes before I create these in
Jira/Xray?" Do not call `create_test`, `create_test_plan`, `create_folder`,
`add_to_test_plan`, or `add_tests_to_folder` until the user gives explicit approval (e.g.
"looks good," "proceed," "yes," or specific approved edits). If the user requests
changes, revise the draft and present it again — repeat until approved. Only once
approved does Step 6 begin.

---

## Step 6 — Create the Xray test case(s), then write the test file

The Xray test case(s) must be created BEFORE writing the file so the returned issue
key(s) can be embedded as `@xray_test` tag(s). This step only runs after the plan was
approved in Step 5 — use the exact `summary`/`description`/`steps` content from that
approved draft, don't redraft here.

**Whole-file mode:**

1. Call `create_test` with the approved `summary`, `description`, `projectKey` (from
   `.xray-sync.yml` or asked in Step 3), `testType: "Manual"`, and `steps` (one step per
   **synced** test case, per the approved draft).

2. Note the returned `issueKey` (e.g. PROJ-47) — this becomes the single `@xray_test` tag value

3. Note the step order exactly as sent in `steps` (1-indexed, in array order). This
   order is what step-level results will be matched against later — Step 7 embeds a
   `[step:N]` marker in each test title using this same numbering, so keep the mapping
   from "step N" to "which test case it was" until you write the file.

4. Call `add_to_test_plan` with:
   - `testPlanKey`: the Test Plan key from Step 3
   - `testIssueIds`: the issueId returned from `create_test`

5. If the Xray folder from Step 4 was just created or may not exist, call `add_tests_to_folder` with:
   - `projectKey`: from config
   - `path`: the folder path from Step 4
   - `testIssueIds`: the issueId returned from `create_test`

**Per-block mode:**

1. Call `create_test` once PER **synced** scenario, using the approved `summary`,
   `description`, `projectKey`, `testType: "Manual"`, and `steps` for that scenario from
   the approved draft.

2. Note each returned `issueKey` (e.g. PROJ-150, PROJ-151) and which `it()`/`test()` block it corresponds to — you'll tag each block individually in Step 7.

3. Call `add_to_test_plan` once with `testIssueIds` containing ALL the issueIds from step 1, so every Test lands in the same Test Plan.

4. If the Xray folder from Step 4 was just created or may not exist, call `add_tests_to_folder` once with all the issueIds from step 1.

---

## Step 7 — Write the test file

Create the test file in the correct location. `@xray_plan` / `@xray_folder` / `@jira_parent`
always go at the very top of the file, before any imports — they apply to the whole file
regardless of tagging mode. Where `@xray_test` goes depends on which mode you chose in Step 5:

**Whole-file mode** — `@xray_test` also goes at the top, alongside the other tags. Each
test title also gets a `[step:N]` marker matching the step order noted in Step 6, so the
pipeline can report per-scenario results inside the one Test instead of a single blended
pass/fail for the whole file:

```
// @xray_test <issue-key-from-step-6>      ← REQUIRED — Xray Test issue key (e.g. PROJ-47)
// @xray_plan <test-plan-key-from-step-3>  ← optional — Test Plan key (e.g. PROJ-149)
// @xray_folder <folder-from-step-4>       ← optional — Xray folder path (e.g. /FeatureA/SubFeatureB)
// @jira_parent <feature-issue-key>        ← optional — parent Jira story (e.g. PROJ-42)

describe('<feature> behaviour', () => {
  it('[step:1] handles a valid case', () => { ... });
  it('[step:2] returns default when input is missing', () => { ... });
  it('[step:3] throws on invalid input', () => { ... });
});
```

`[step:N]` must always be 1-indexed and match the order the steps were created in during
Step 6 — the pipeline has no other way to know which test function corresponds to which
step. If a test case from Step 2 doesn't map to any step (shouldn't happen, but if the
file ends up with an extra test not represented in Xray), leave it untagged — an untagged
test just doesn't report a step result, it doesn't break the others.

**Per-block mode** — `@xray_test` goes directly above EACH `it()`/`test()` call it applies to
(no blank `it()`/`test()` call in between — blank lines and other comments are fine). Any
`it()`/`test()` in the file with no `@xray_test` directly above it is simply not synced —
only tag the blocks you created a Test for in Step 6:

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
> "What is the Jira issue key for this feature? (e.g. PROJ-42)"

Then write the full test file body, matching the conventions discovered in Step 1 exactly.

---

## Step 8 — Tell the user what to do next

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

## Modifying existing tests

Use these tools when asked to fix, update, reorder, or remove Xray Tests that already
exist — not while running Steps 1–8 above to generate new ones.

**Finding tests — `search_tests`.** Use this when the user hasn't given an exact key —
by JQL, project, Test Repository folder, and/or test type. Returns summary/key/testType/
folder/step count for each match, not full step content (use `get_test` for that):
```
search_tests({ projectKey: "PROJ", folderPath: "/FeatureA", includeDescendantFolders: true })
search_tests({ jql: "labels = sprint-42 AND issuetype = Test" })
```
Capped at 100 results by Xray — if a search legitimately exceeds that, narrow it (by
folder, testType, or JQL) instead of trying to raise the limit further. Confirm matches
with the user before acting on them if the search was broad or the intent was ambiguous.

**Looking up one test — `get_test`.** Always call this first when you need a step's id or
its current position — never guess them:
```
get_test({ testIssueKey: "PROJ-47" })
```
Returns each step with:
- `position` — 1-indexed, matches the step's current order in Xray right now
- `id` — required for `update_test`'s `stepUpdates`/`removeStepIds`, and for choosing
  `reorder_test_steps`'s `newOrder`
- `action` / `data` / `result` — the step's current content
- `safeToReorder` — `false` if the step has attachments or calls another test. If any
  step on the Test is `false`, `reorder_test_steps` will refuse to run on it at all.

**Updating a test — `update_test`.** Accepts a batch, one entry per Test. Only
`testIssueKey` is required — include only the fields actually being changed:
```
update_test({
  updates: [{
    testIssueKey: "PROJ-47",
    summary: "...",                                               // Jira fields
    description: "...",
    parentKey: "PROJ-42",
    assignee: "jane@company.com",
    sprintId: 123,
    testType: "Manual",                                           // Xray fields
    folderPath: "/FeatureA/SubFeatureB",
    linkedIssues: [{ issueKey: "PROJ-99", linkType: "Relates" }],
    stepUpdates: [{ stepId: "<from get_test>", result: "..." }],   // edit step content
    addSteps: [{ action: "...", result: "..." }],                 // append new steps
    removeStepIds: ["<from get_test>"],                            // delete steps
  }],
})
```
This never reorders steps — use `reorder_test_steps` for that. Each sub-operation
(assignee lookup, sprint lookup, each link, each step edit) fails independently and shows
up in the response's `warnings` array rather than failing the whole update — check
`warnings` even when `status` is `"updated"`.

**Reordering steps — `reorder_test_steps`.** Xray has no native "move step" mutation, so
this deletes all of a Test's steps and recreates them in the new order — which is why it
refuses outright if any step has attachments or calls another test, rather than silently
dropping that data. Always call `get_test` first and check `safeToReorder` on every step:
```
reorder_test_steps({
  testIssueKey: "PROJ-47",
  newOrder: [3, 1, 2],   // 1-indexed positions from the CURRENT order — a permutation of 1..N
})
```

**Deleting a test — `delete_test`.** Permanent. Cannot be undone:
```
delete_test({ testIssueKeys: ["PROJ-47"] })
```
Always confirm the exact key(s) with the user before calling this — never delete a Test
speculatively, as a side effect of another request, or without the user naming the key.
The one standing exception is a disposable `FORMAT PROBE` Test created for Step 5's
formatting check above — delete it once it's served its purpose.

---

## Implementing existing Jira Tests as code

Sometimes a Test is defined in Jira FIRST — a QA engineer or PM wrote manual steps in
Xray before any code existed — and you're asked to write the automated test that
implements it. This is the reverse of Steps 1–8 above: the Xray Test(s) already exist, so
you never call `create_test` here.

1. **Find the Test(s).** If given exact key(s) already, skip to step 2. Otherwise use
   `search_tests` (by project/folder/testType/JQL) and confirm the matches with the user
   before proceeding — don't guess which Test they mean from a partial description.

2. **Retrieve full detail with `get_test`** for each Test — its `summary`, `steps`
   (`action`/`data`/`result`, in `position` order), and `folderPath`.

3. **Still do Step 1 above** (read existing test files for this repo's framework and
   conventions) — a Test coming from Jira instead of being drafted from code doesn't
   change what the code itself needs to look like.

4. **Translate each step's manual/QA-oriented `action`/`data`/`result` into real code.**
   Steps written for manual QA describe tool-level actions ("I open the HTTP client...",
   "I click Edit on the field...") — translate these into the equivalent code for this
   repo's stack (e.g. a `supertest`/`axios` call for an HTTP-client step, a
   render-and-click sequence for a UI step). This is Step 5's action/data/result
   translation in reverse. Read the actual feature code (same as Step 2) to get inputs and
   assertions right — the Jira step describes the intended behaviour, not the
   implementation, and manual-QA wording is not a spec to transcribe literally.

5. **Decide file/test layout from how many Tests you retrieved** — the tagging-mode
   decision from Step 5 is already made by Jira's existing structure, not up to judgment:
   - **One Test with multiple steps** → one file, one code test per step, each titled with
     a `[step:N]` marker matching that step's `position` from `get_test` (whole-file mode).
   - **Multiple Tests** → tag each corresponding block with its own `@xray_test` key
     (per-block mode), same as Step 7.

6. **Write the file per Step 7's tagging rules**, using the retrieved `folderPath` for
   `@xray_folder` and the exact existing key(s) for `@xray_test`. `get_test` doesn't
   return a Test Plan or parent story, so ask for `@xray_plan`/`@jira_parent` the same way
   Step 3/Step 7 would if the user wants them.

7. **Tell the user what was created**, same shape as Step 8, but note explicitly that no
   new Jira issue was created — only the code file and its tags.

---

## Important rules

- `get_test`, `update_test`, `delete_test`, and `reorder_test_steps` exist for fixing an
  already-created Xray Test — see **Modifying existing tests** above. This doesn't replace
  Step 5's review gate: `reorder_test_steps` refuses to run if any step has attachments or
  calls another test, and patching many steps one at a time via `update_test` is slower
  than getting the draft right upfront. Get the plan right before creating it; use these
  tools to fix what slips through, not as a substitute for the review step.
- Never call `create_test`, `create_test_plan`, `create_folder`, `add_to_test_plan`, or
  `add_tests_to_folder` before the user has explicitly approved the drafted plan in
  Step 5. A drafted plan the user hasn't confirmed is not authorization to proceed.
- Never call `create_test` for a Test that already exists in Jira — check with
  `search_tests`/`get_test` first if there's any doubt. A Test found via `search_tests` or
  named directly by the user goes through **Implementing existing Jira Tests as code**
  above, not the create flow.
- Never skip Step 1 — always read existing tests before writing new ones
- Tests must be thorough: every success path, every failure path, and every edge case
  actually present in the code's branches/validation must get its own test case — not a
  single representative happy-path test and a single generic failure test. If the code
  has 4 validation rules, write 4 failure cases, one per rule, not one that hand-waves
  "invalid input."
- Never hardcode a testing framework — detect it from the project
- Never write the test file without @xray_test — always create the Xray test case first
  so the real issue key is available to embed in the file header
- Never confuse @xray_test (Test issue key) with @xray_plan (Test Plan key)
- Every `create_test` call includes a `description` in the *Purpose:*/*Scope:*/*Related:*
  format — never free-form prose, never blank, and never just a restatement of the steps.
- Never override a configured `xray_tagging_mode` from `.xray-sync.yml` based on
  how the test cases look — config always wins over judgment
- Never call `create_test` for a test case whose type is listed in
  `xray_ignore_test_types` — no issue is created, no `@xray_test` tag is applied, and it
  is never added to a Test Plan or folder. This overrides the "never write without
  @xray_test" rule below when every test case in a file is excluded: in that case the
  file is written with zero Xray tags, which is correct, not an error.
- In whole-file mode, always add a `[step:N]` marker to each test title, numbered to
  match the step order used when the Xray Test was created in Step 6 — this is what
  lets the pipeline report per-scenario results instead of one blended status for the
  file (requires the pipeline's reporter/import logic to parse `[step:N]` and import it
  as a step result — confirm that's in place before relying on this for status accuracy)
- Never create a Test Plan automatically — always ask the user for a Test Plan key first,
  and only create a new one if the user explicitly requests it
- Always ask the user for the fix version, even when `.xray-sync.yml` has one — use the
  config value as a suggestion, not an automatic answer
- If the MCP tools are not available, write the test file with placeholder tags and
  tell the user to:
  1. Connect the configured Xray MCP connector (see your `.xray-sync.yml` / project setup
     for the connection URL)
  2. Then ask Claude Code to run Steps 5–7 again to draft, review, and create the Xray
     test case, and replace the placeholder tags with real issue keys
- If the user says "just write the tests" without Xray context, write the file first
  with placeholder tags and handle Xray setup afterward — never block test generation
  on Xray setup