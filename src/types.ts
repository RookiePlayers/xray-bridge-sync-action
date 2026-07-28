// ─── Xray Test Run Statuses ───────────────────────────────────────────────────

// Must match Xray Cloud's built-in Test Run status names exactly, since the
// service's updateTestRunStatus mutation rejects anything else.
export type XrayTestStatus = 'TODO' | 'EXECUTING' | 'PASSED' | 'FAILED' | 'ABORTED';

// ─── Tag extraction ───────────────────────────────────────────────────────────

/** A single @xray_test tag paired with the it()/test() title it precedes (per-block mode only). */
export interface XrayTestTag {
  key: string;
  title?: string;   // undefined if no it()/test() call was found after the tag
}

export interface FileTags {
  xrayPlan?: string;
  xrayTest?: string;          // set when the file has exactly one @xray_test tag (whole-file aggregate)
  xrayTests?: XrayTestTag[];  // set when the file has 2+ @xray_test tags (per-block mode)
  xrayFolder?: string;
  jiraParent?: string;
}

// ─── Normalised internal format (reporter-agnostic) ───────────────────────────
// Mirrors the shape xray-sync-service produces from the same raw results, used
// here only for local validation/logging before the payload is sent.

export interface TestFailure {
  testName: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface NormalisedTestFile {
  filePath: string;
  testTitle?: string;   // set when this entry represents one it()/test() block, not the whole file
  xrayPlan?: string;
  xrayTest?: string;
  xrayFolder?: string;
  jiraParent?: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  status: XrayTestStatus;
  failures: TestFailure[];
}

export interface NormalisedResult {
  runAt: string;
  files: NormalisedTestFile[];
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  overallStatus: XrayTestStatus;
  parseWarnings: string[];
}
