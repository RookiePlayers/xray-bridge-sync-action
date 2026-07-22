import {
  NormalisedResult,
  NormalisedTestFile,
  TestFailure,
  XrayTestStatus,
  FileTags,
} from '../types';

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
 * @param tagMap  Map of filePath -> { xrayPlan, xrayFolder, jiraParent },
 *                built by the GitHub Action's extract-tags.js script since
 *                the service has no filesystem access to the consumer repo.
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

  const files: NormalisedTestFile[] = output.testResults.map((fileResult) => {
    const tags = tagMap[fileResult.name] ?? {};
    const assertionResults = fileResult.assertionResults ?? [];

    const passed = assertionResults.filter((t) => t.status === 'passed').length;
    const failed = assertionResults.filter((t) => t.status === 'failed').length;
    const skipped = assertionResults.filter((t) => t.status === 'pending').length;

    const failures: TestFailure[] = assertionResults
      .filter((t) => t.status === 'failed')
      .map((t) => {
        const rawMessage = t.failureMessages?.[0] ?? '';
        return {
          testName: t.fullName,
          message: cleanFailureMessage(rawMessage),
          expected: extractExpected(rawMessage),
          received: extractReceived(rawMessage),
        };
      });

    const status: XrayTestStatus = failed > 0 ? 'FAIL' : 'PASS';
    const duration = fileResult.endTime - fileResult.startTime;

    return {
      filePath: fileResult.name,
      xrayPlan: tags.xrayPlan,
      xrayFolder: tags.xrayFolder,
      jiraParent: tags.jiraParent,
      passed,
      failed,
      skipped,
      duration,
      status,
      failures,
    };
  });

  const overallStatus: XrayTestStatus = output.numFailedTests > 0 ? 'FAIL' : 'PASS';

  return {
    runAt: new Date(output.startTime).toISOString(),
    files,
    totalPassed: output.numPassedTests,
    totalFailed: output.numFailedTests,
    totalSkipped: output.numPendingTests,
    overallStatus,
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