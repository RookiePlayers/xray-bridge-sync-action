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
     even if it also happens to live in the same file as unit tests.
   This classification is used in Step 5 to decide which test cases get an Xray Test
   created — do not skip it even if Xray sync isn't being discussed yet.
5. Do not write trivial tests that only check that a function exists or returns something non-null — every test case should verify meaningful behaviour

---

## Step 3 — Resolve fix version and Test Plan

Read `.xray-sync.yml` if it exists in the repo root. Extract `project_key`, `fix_version`,
`xray_tagging_mode`, and `xray_ignore_test_types` (if present).

**Ignored test types:**
- `xray_ignore_test_types` is a list containing zero or more of `unit`, `integration`
  (e.g. `xray_ignore_test_types: [unit]`).
- Any test case classified in Step 2 as one of the listed types is excluded from Xray
  entirely in Step 5 — no `create_test` call is made for it, no issue key exists for it,
  and it gets no `@xray_test` tag in Step 6. It is still written into the test file and
  still runs normally; it simply isn't represented in Jira/Xray at all.
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

## Step 5 — Create the Xray test case(s) FIRST, then write the test file

Unlike the other steps, the Xray test case(s) must be created BEFORE writing the file
so the returned issue key(s) can be embedded as `@xray_test` tag(s).

**First, apply `xray_ignore_test_types` from Step 3.** Split the test cases identified
in Step 2 into two groups:
- **Synced** — test cases whose type is NOT in `xray_ignore_test_types`. Only these
  are eligible to get an Xray Test created below.
- **Excluded** — test cases whose type IS in `xray_ignore_test_types`. These never get
  a `create_test` call, never get an issue key, and never get an `@xray_test` tag. They
  still get written into the file in Step 6 exactly like any other test — they just have
  no Xray involvement at all.

If EVERY test case in the file falls into the excluded group (e.g. the whole file is
`unit` tests and `xray_ignore_test_types` contains `unit`), skip the rest of this step
and Step 5's Xray calls entirely — go straight to Step 6 and write the file with no
`@xray_test`, `@xray_plan`, `@xray_folder`, or `@jira_parent` tags at all. This is the
one case where the "never write without `@xray_test`" rule does not apply, because there
is legitimately nothing to sync.

Otherwise, continue below using only the **synced** group when deciding tagging mode and
creating Xray Tests — the excluded group is not considered.

**Action format for integration test cases.** When writing the `action`/`data`/`result`
for a `steps` entry (whole-file mode) or a scenario's `steps` (per-block mode), test
cases classified as `integration` in Step 2 must describe the manual reproduction of the
scenario through the relevant tool (e.g. an HTTP client like Postman, for API tests), not
the code. A QA engineer reading the Xray Test should be able to follow it by hand,
without looking at the test file. `unit` test cases are unaffected by this and keep
describing the function call as before.

**This is the preferred, default format — use it unless the user explicitly asks for
flowing-paragraph prose instead:**

Every step is one of two shapes:

- **Full numbered walkthrough** — for the step that actually sends a request with a
  meaningfully different setup (a new endpoint, a new payload shape). `action` is a
  numbered, tool-level walkthrough a QA engineer can follow by hand, not a description of
  the code:
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
- **Short one-liner** — for a variant/edge-case request that only differs from an earlier
  full-walkthrough step in payload, auth, or headers, or for a step that only verifies
  state from an earlier step (no new request). Reference the earlier step number instead
  of re-describing the setup:
  ```
  Trying to send the same request from step 1, but with an *invalid <fieldA>* value.
  ```
  Its `data` states only the diff from that earlier step:
  ```
  Same as step 1, except:
  {code:json}
  { "<fieldA>": "<invalid value>" }
  {code}
  ```

**`result`** always leads with the response, then a `*Database:*` section listing every
side effect — this applies to both shapes:
```
*Response:*
{code:json}
{ "success": true, "message": "<action> completed successfully.", "data": { "<idField>": "<new id>" } }
{code}

*Database:*
- {{<table_name>}}: new row (*<columnA>*=<value>, *<columnB>*=<value>)
- {{<other_table_name>}}: new row (*<columnC>*=<value>, *<columnD>* set)
```
For a rejected/failed request, `*Response:*` is the status and validation error instead
of a code block (e.g. `HTTP *422* validation error on {{<fieldA>}}`), and `*Database:*`
states what was NOT created (e.g. `No rows are created.`).

**Text formatting — apply throughout `action`/`data`/`result`, for every test type:**
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
- **Before recreating a multi-step Xray Test with any formatting syntax that hasn't been
  confirmed to render correctly in THIS Jira instance**, create a tiny one-step throwaway
  probe Test first (summary prefixed `FORMAT PROBE`, skip `add_to_test_plan`/
  `add_tests_to_folder` since it's disposable), covering one example of each syntax
  element in use, and ask the user to screenshot how it rendered before committing to the
  full Test. Recreating a full multi-step Test to fix formatting is expensive — no tool
  exists to edit an already-created Test's steps (see the rule on this below) — so a
  cheap 1-step probe is worth it whenever the syntax is unconfirmed for this Jira.

Never fall back to describing the HTTP client call in code terms (e.g. "call the endpoint
with axios") for an integration test case.

Next decide which of the two tagging modes fits the feature (see Step 6 for full
details on each mode's tag placement):

- **Config takes priority.** If `xray_tagging_mode` was found in `.xray-sync.yml` in
  Step 3, use it directly — `whole-file` or `per-block` — and skip the judgment call
  below entirely. Do not override a configured mode based on how the test cases look.
- **No config value set — fall back to judgment:**
  - **Whole-file mode (default)** — the test cases identified in Step 2 are variations
    of one behaviour and read naturally as steps of a single manual Test (e.g. a function
    with 3 steps: valid input, missing input, invalid input). Create ONE Xray Test with
    multiple steps.
  - **Per-block mode** — the test cases identified in Step 2 are independently meaningful
    scenarios that a QA engineer would want to track and report on separately in Xray
    (e.g. distinct API behaviours, distinct endpoints, distinct business rules bundled
    in one file for code-organisation reasons only). Create one Xray Test PER scenario.
    Use this whenever you're unsure which mode fits better — it gives finer-grained
    Xray reporting at no extra cost.
  - If judgment is used (no config value present), mention in Step 7's output which
    mode was picked and that setting `xray_tagging_mode` in `.xray-sync.yml` will make
    it consistent going forward.

**Whole-file mode:**

1. Call `create_test` with:
   - `summary`: a clear title describing what this test file covers (e.g. "<Feature> — <behaviour> validation")
   - `projectKey`: from `.xray-sync.yml` or ask the user
   - `testType`: "Manual"
   - `steps`: one step per **synced** test case (i.e. excluding anything filtered out by
     `xray_ignore_test_types` above) using:
     - `action`: what the test does (e.g. "Call `<function>` with a valid input")
     - `data`: the input being used
     - `result`: the expected outcome
   - If the file mixes synced and excluded test cases (e.g. unit tests ignored,
     integration tests synced), the resulting Xray Test only has steps for the synced
     ones — the excluded test cases simply have no step and no `[step:N]` marker in
     Step 6, same treatment as any other untagged test.

2. Note the returned `issueKey` (e.g. PROJ-47) — this becomes the single `@xray_test` tag value

3. Note the step order exactly as sent in `steps` (1-indexed, in array order). This
   order is what step-level results will be matched against later — Step 6 embeds a
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

1. Call `create_test` once PER **synced** scenario (excluding anything filtered out by
   `xray_ignore_test_types` above), each with its own `summary` (e.g. "<Feature> — scenario A", "<Feature> — scenario B"), `projectKey`, `testType: "Manual"`, and its own `steps` describing just that one scenario. Excluded scenarios are written into the file in Step 6 like any other test, just with no `@xray_test` tag above them.

2. Note each returned `issueKey` (e.g. PROJ-150, PROJ-151) and which `it()`/`test()` block it corresponds to — you'll tag each block individually in Step 6.

3. Call `add_to_test_plan` once with `testIssueIds` containing ALL the issueIds from step 1, so every Test lands in the same Test Plan.

4. If the Xray folder from Step 4 was just created or may not exist, call `add_tests_to_folder` once with all the issueIds from step 1.

---

## Step 6 — Write the test file

Create the test file in the correct location. `@xray_plan` / `@xray_folder` / `@jira_parent`
always go at the very top of the file, before any imports — they apply to the whole file
regardless of tagging mode. Where `@xray_test` goes depends on which mode you chose in Step 5:

**Whole-file mode** — `@xray_test` also goes at the top, alongside the other tags. Each
test title also gets a `[step:N]` marker matching the step order noted in Step 5, so the
pipeline can report per-scenario results inside the one Test instead of a single blended
pass/fail for the whole file:

```
// @xray_test <issue-key-from-step-5>      ← REQUIRED — Xray Test issue key (e.g. PROJ-47)
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
Step 5 — the pipeline has no other way to know which test function corresponds to which
step. If a test case from Step 2 doesn't map to any step (shouldn't happen, but if the
file ends up with an extra test not represented in Xray), leave it untagged — an untagged
test just doesn't report a step result, it doesn't break the others.

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
> "What is the Jira issue key for this feature? (e.g. PROJ-42)"

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

- No tool exists to edit or delete an already-created Xray Test's steps — only
  `create_test` (new issue), `add_to_test_plan`, `add_tests_to_folder`, and `create_folder`
  are available. If a Test's steps need to change (wrong format, missing coverage,
  wrong wording), the only option is to `create_test` again and repoint the file's
  `@xray_test` tag to the new key — the old issue is left behind in Jira, orphaned but
  not deleted. This makes getting the format/coverage right BEFORE calling `create_test`
  worth the extra care — confirm ambiguous formatting choices (e.g. which markup syntax
  the user's Jira renders) with the user first rather than guessing and recreating.
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
- Never override a configured `xray_tagging_mode` from `.xray-sync.yml` based on
  how the test cases look — config always wins over judgment
- Never call `create_test` for a test case whose type is listed in
  `xray_ignore_test_types` — no issue is created, no `@xray_test` tag is applied, and it
  is never added to a Test Plan or folder. This overrides the "never write without
  @xray_test" rule below when every test case in a file is excluded: in that case the
  file is written with zero Xray tags, which is correct, not an error.
- In whole-file mode, always add a `[step:N]` marker to each test title, numbered to
  match the step order used when the Xray Test was created in Step 5 — this is what
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
  2. Then ask Claude Code to run Steps 5–6 again to create the Xray test case and
     replace the placeholder tags with real issue keys
- If the user says "just write the tests" without Xray context, write the file first
  with placeholder tags and handle Xray setup afterward — never block test generation
  on Xray setup
