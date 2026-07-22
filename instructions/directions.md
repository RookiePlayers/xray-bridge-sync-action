Write feature
  → Ask Claude Code "write tests for this"
  → Claude reads your codebase, generates real tests
  → Asks you for test plan + Jira issue
  → Creates the test file with @xray_plan tags
  → Calls create_test, add_to_test_plan, add_tests_to_folder via MCP
  → You push → pipeline runs → results sync to Jira automatically