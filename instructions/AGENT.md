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

## Step 3 — Ask the user for Xray context

Before creating the test file, ask the user:

> "Which Jira Test Plan should these tests be linked to? (e.g. DTV-33)
> If you're not sure, I can create a new one."

Wait for their answer. Also check if there is a `.xray-sync.yml` in the repo root — if it exists, read `project_key` and `fix_version` from it as defaults.

---

## Step 4 — Determine the correct folder location

1. Look at the existing test directory structure to understand how tests are organised (by feature area, by module, by endpoint, by layer, etc.)
2. Infer the correct folder for the new test based on where similar tests live
3. If no clear pattern exists, ask the user: "Where would you like this test file to go?"
4. This folder path is also what you will use as the `@xray_folder` tag value

---

## Step 5 — Write the test file

Create the test file in the correct location. At the very top of the file, before any imports, add the Xray tags:

```
// @xray_plan <test-plan-key-from-step-3>
// @xray_folder <folder-path-from-step-4>
// @jira_parent <jira-issue-key-for-the-feature-being-tested>
```

For `@jira_parent`, use the Jira issue key for the feature/story this test covers if the user has mentioned it, or ask: "What is the Jira issue key for this feature? (e.g. DTV-42)"

Then write the full test file, matching the conventions discovered in Step 1 exactly.

---

## Step 6 — Create the matching Xray test case

After the test file is written, use the available MCP tools to create the corresponding Xray test case in Jira:

1. Call `create_test` with:
   - `summary`: a clear title describing what this test file covers
   - `projectKey`: from `.xray-sync.yml` or ask the user
   - `testType`: "Manual"
   - `steps`: one step per meaningful test case in the file, using:
     - `action`: what the test does (e.g. "POST /auth/login with valid credentials")
     - `data`: the input being used
     - `result`: the expected outcome

2. Call `add_to_test_plan` with the test plan key from Step 3 and the issueId returned from `create_test`

3. If the folder from Step 4 doesn't already exist in Xray, call `create_folder` first, then call `add_tests_to_folder`

Report back to the user with:
- The created test file path
- The Jira key of the new Xray test case
- Confirmation it has been added to the test plan and folder

---

## Step 7 — Tell the user what to do next

```
Test file created: <path>
Xray test case:   <jira-key>
Test plan:        <test-plan-key>
Folder:           <folder-path>

Next steps:
1. Review the generated test file and adjust if needed
2. Push to your branch — the pipeline will run the tests automatically
3. Results will sync to Jira under the Test Execution for <fix_version>
```

---

## Important rules

- Never skip Step 1 — always read existing tests before writing new ones
- Never hardcode a testing framework — detect it from the project
- Never create an Xray test case before the test file is written and reviewed
- If the MCP tools are not available, write the test file anyway and tell the user
  to manually create the Xray test case after connecting their account at /connect/xray
- If the user says "just write the tests" without Xray context, write the file first
  and ask for Xray details afterward — never block test generation on Xray setup