// ─── Xray Test Run Statuses ───────────────────────────────────────────────────

export type XrayTestStatus = 'TODO' | 'EXECUTING' | 'PASS' | 'FAIL' | 'ABORTED';

// ─── Tag extraction ───────────────────────────────────────────────────────────

export interface FileTags {
  xrayPlan?: string;
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
  xrayPlan?: string;
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
}
