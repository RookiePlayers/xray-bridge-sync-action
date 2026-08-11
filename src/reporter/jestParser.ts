import {
  NormalisedResult,
  NormalisedTestFile,
  TestFailure,
  XrayTestStatus,
  FileTags,
} from '../types';
import { buildStepResults, mapOutcomeToStepStatus } from './stepMarker';

// ─── Jest JSON output types ───────────────────────────────────────────────────

interface JestOutput {
  testResults: JestTestResult[];
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  startTime: number;
}

interface JestTestResult {
  name: string;                            // file path (Jest's actual field name)
  assertionResults: JestAssertionResult[]; // per-test results
  startTime: number;
  endTime: number;
  status: string;
}

interface JestAssertionResult {
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'pending';
  failureMessages: string[];
  duration?: number;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses Jest --json output into the normalised internal format.
 *
 * @param raw     Raw Jest --json output (as a string)
 * @param tagMap  Map of filePath -> FileTags, built by the GitHub Action's
 *                tagExtractor.ts since the service has no filesystem access
 *                to the consumer repo.
 */
export function parseJestOutput(raw: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
  let output: JestOutput;

  try {
    const parsed = JSON.parse(raw);
    // Handle case where raw is double-stringified (jq tostring on already-stringified JSON)
    output = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    throw new Error('Failed to parse Jest JSON output — ensure you ran Jest with --json flag');
  }

  if (!output || !Array.isArray(output.testResults)) {
    const keys = output && typeof output === 'object' ? Object.keys(output).join(', ') : typeof output;
    throw new Error(`Invalid Jest output shape — missing or non-array testResults. Got keys: ${keys}`);
  }

  const parseWarnings: string[] = [];

  const files: NormalisedTestFile[] = output.testResults.flatMap((fileResult) => {
    const tags = tagMap[fileResult.name] ?? {};
    const assertionResults = fileResult.assertionResults ?? [];

    if (tags.xrayTests && tags.xrayTests.length > 0) {
      return buildBlockEntries(fileResult.name, tags, assertionResults, parseWarnings);
    }

    return [buildWholeFileEntry(fileResult, tags, assertionResults)];
  });

  const overallStatus: XrayTestStatus = output.numFailedTests > 0 ? 'FAILED' : 'PASSED';

  return {
    runAt: new Date(output.startTime).toISOString(),
    files,
    totalPassed: output.numPassedTests,
    totalFailed: output.numFailedTests,
    totalSkipped: output.numPendingTests,
    overallStatus,
    parseWarnings,
  };
}

// ─── Whole-file aggregate (0 or 1 @xray_test tag in the file) ────────────────

function buildWholeFileEntry(
  fileResult: JestTestResult,
  tags: FileTags,
  assertionResults: JestAssertionResult[]
): NormalisedTestFile {
  const passed = assertionResults.filter((t) => t.status === 'passed').length;
  const failed = assertionResults.filter((t) => t.status === 'failed').length;
  const skipped = assertionResults.filter((t) => t.status === 'pending').length;

  const failures: TestFailure[] = assertionResults
    .filter((t) => t.status === 'failed')
    .map(buildFailure);

  const status: XrayTestStatus = failed > 0 ? 'FAILED' : 'PASSED';
  const duration = fileResult.endTime - fileResult.startTime;

  const steps = buildStepResults(
    assertionResults.map((t) => ({
      title: t.title,
      status: mapOutcomeToStepStatus(t.status),
      duration: t.duration ?? 0,
      failure: t.status === 'failed' ? buildFailure(t) : undefined,
    }))
  );

  return {
    filePath: fileResult.name,
    xrayPlan: tags.xrayPlan,
    xrayTest: tags.xrayTest,
    xrayFolder: tags.xrayFolder,
    jiraParent: tags.jiraParent,
    passed,
    failed,
    skipped,
    duration,
    status,
    failures,
    steps: steps.length > 0 ? steps : undefined,
  };
}

// ─── Per-block mode (2+ @xray_test tags in the file) ─────────────────────────

function buildBlockEntries(
  filePath: string,
  tags: FileTags,
  assertionResults: JestAssertionResult[],
  parseWarnings: string[]
): NormalisedTestFile[] {
  const entries: NormalisedTestFile[] = [];

  for (const { key, title } of tags.xrayTests ?? []) {
    if (!title) {
      parseWarnings.push(`@xray_test ${key} in ${filePath} has no following it()/test() block — skipping`);
      continue;
    }

    const match = assertionResults.find((t) => t.title === title);
    if (!match) {
      parseWarnings.push(`@xray_test ${key} in ${filePath} didn't match any test titled "${title}" — skipping`);
      continue;
    }

    const failed = match.status === 'failed' ? 1 : 0;

    entries.push({
      filePath,
      testTitle: title,
      xrayPlan: tags.xrayPlan,
      xrayTest: key,
      xrayFolder: tags.xrayFolder,
      jiraParent: tags.jiraParent,
      passed: match.status === 'passed' ? 1 : 0,
      failed,
      skipped: match.status === 'pending' ? 1 : 0,
      duration: match.duration ?? 0,
      status: failed > 0 ? 'FAILED' : 'PASSED',
      failures: match.status === 'failed' ? [buildFailure(match)] : [],
    });
  }

  return entries;
}

function buildFailure(t: JestAssertionResult): TestFailure {
  const rawMessage = t.failureMessages?.[0] ?? '';
  return {
    testName: t.fullName,
    message: cleanFailureMessage(rawMessage),
    expected: extractExpected(rawMessage),
    received: extractReceived(rawMessage),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanFailureMessage(raw: string): string {
  return raw.replace(/\x1B\[[0-9;]*m/g, '').split('\n').slice(0, 5).join('\n').trim();
}

function extractExpected(message: string): string | undefined {
  const match = message.match(/Expected[:\s]+(.+)/i);
  return match?.[1]?.replace(/\x1B\[[0-9;]*m/g, '').trim();
}

function extractReceived(message: string): string | undefined {
  const match = message.match(/Received[:\s]+(.+)/i);
  return match?.[1]?.replace(/\x1B\[[0-9;]*m/g, '').trim();
}

// ─── Reporter interface + class ────────────────────────────────────────────────

export interface TestReporter {
  parse(rawOutput: string, tagMap?: Record<string, FileTags>): NormalisedResult;
}

export class JestReporter implements TestReporter {
  parse(rawOutput: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
    return parseJestOutput(rawOutput, tagMap);
  }
}
