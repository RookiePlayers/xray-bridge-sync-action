import {
  NormalisedResult,
  NormalisedTestFile,
  TestFailure,
  XrayTestStatus,
  FileTags,
} from '../types';
import type { TestReporter } from './jestParser';

// ─── Mocha JSON output types ──────────────────────────────────────────────────
// Shape produced by: mocha --reporter json --reporter-options output=results.json
// Key difference from Jest: the tests array is FLAT across all files, not
// grouped by file. We group by the `file` field ourselves.

interface MochaOutput {
  stats: {
    suites: number;
    tests: number;
    passes: number;
    pending: number;
    failures: number;
    start: string; // ISO timestamp
    end: string;
  };
  tests: MochaTestResult[];    // ALL tests (pass + fail + pending)
  pending: MochaTestResult[];  // pending subset
  failures: MochaTestResult[]; // failure subset
  passes: MochaTestResult[];   // pass subset
}

interface MochaTestResult {
  title: string;
  fullTitle: string;
  file: string;        // the test file path — key field for tag-map lookup
  duration?: number;   // milliseconds, present on completed tests
  err?: {
    message?: string;
    stack?: string;
  };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses Mocha --reporter json output into the normalised internal format.
 *
 * @param raw     Raw Mocha JSON output (as a string)
 * @param tagMap  Map of filePath -> { xrayPlan, xrayFolder, jiraParent }
 */
export function parseMochaOutput(raw: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
  let output: MochaOutput;

  try {
    const parsed = JSON.parse(raw);
    output = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    throw new Error('Failed to parse Mocha JSON output — ensure you ran Mocha with --reporter json');
  }

  if (!output || !Array.isArray(output.tests)) {
    const keys = output && typeof output === 'object' ? Object.keys(output).join(', ') : typeof output;
    throw new Error(`Invalid Mocha output shape — missing or non-array tests. Got keys: ${keys}`);
  }

  // Build lookup sets from the subset arrays — Mocha's flat tests array doesn't
  // carry a clean pass/fail boolean per item, so we infer status from which
  // subset array the test also appears in.
  const failedTitles = new Set(output.failures.map((t) => t.fullTitle));
  const pendingTitles = new Set(output.pending.map((t) => t.fullTitle));

  // Group the flat tests array by file
  const fileGroups = new Map<string, MochaTestResult[]>();
  for (const test of output.tests) {
    const existing = fileGroups.get(test.file) ?? [];
    existing.push(test);
    fileGroups.set(test.file, existing);
  }

  const files: NormalisedTestFile[] = Array.from(fileGroups.entries()).map(([filePath, tests]) => {
    const tags = tagMap[filePath] ?? {};

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalDuration = 0;
    const failures: TestFailure[] = [];

    for (const test of tests) {
      totalDuration += test.duration ?? 0;

      if (pendingTitles.has(test.fullTitle)) {
        skipped++;
      } else if (failedTitles.has(test.fullTitle)) {
        failed++;
        failures.push({
          testName: test.fullTitle,
          message: (test.err?.message ?? '').split('\n')[0],
          // Mocha's err object doesn't separate expected/received the structured
          // way Jest's failureMessages do — the message above carries the info unstructured
          expected: undefined,
          received: undefined,
        });
      } else {
        passed++;
      }
    }

    const status: XrayTestStatus = failed > 0 ? 'FAIL' : 'PASS';

    return {
      filePath,
      xrayPlan: tags.xrayPlan,
      xrayFolder: tags.xrayFolder,
      jiraParent: tags.jiraParent,
      passed,
      failed,
      skipped,
      duration: totalDuration,
      status,
      failures,
    };
  });

  const overallStatus: XrayTestStatus = output.stats.failures > 0 ? 'FAIL' : 'PASS';

  return {
    runAt: new Date(output.stats.start).toISOString(),
    files,
    totalPassed: output.stats.passes,
    totalFailed: output.stats.failures,
    totalSkipped: output.stats.pending,
    overallStatus,
  };
}

// ─── Reporter class ────────────────────────────────────────────────────────────

export class MochaReporter implements TestReporter {
  parse(rawOutput: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
    return parseMochaOutput(rawOutput, tagMap);
  }
}