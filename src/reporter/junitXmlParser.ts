import { XMLParser } from 'fast-xml-parser';
import {
  NormalisedResult,
  NormalisedTestFile,
  TestFailure,
  XrayTestStatus,
  FileTags,
} from '../types';
import type { TestReporter } from './jestParser';

// ─── JUnit XML types ──────────────────────────────────────────────────────────
// Covers output from both Pest (--log-junit) and Pytest (--junit-xml).
// Both produce the same JUnit XML schema regardless of which tool generated it.
//
// Root element may be <testsuites> (plural, typical Pytest) or a bare
// <testsuite> with no wrapper (some Pest/PHPUnit configurations).

interface JUnitTestCase {
  '@_classname'?: string;
  '@_name': string;
  '@_time'?: string;
  '@_file'?: string;  // not always present — see resolveFileKey below
  failure?: { '@_message'?: string; '#text'?: string } | Array<{ '@_message'?: string; '#text'?: string }>;
  skipped?: { '@_message'?: string } | string;
  error?: { '@_message'?: string; '#text'?: string };
}

interface JUnitTestSuite {
  '@_name': string;
  '@_tests'?: string;
  '@_failures'?: string;
  '@_skipped'?: string;
  '@_time'?: string;
  testcase: JUnitTestCase | JUnitTestCase[];
}

interface JUnitRoot {
  testsuites?: { testsuite: JUnitTestSuite | JUnitTestSuite[] };
  testsuite?: JUnitTestSuite | JUnitTestSuite[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Resolves a stable file-path key for a JUnit testcase, used to look up
 * @xray_plan/@xray_folder/@jira_parent tags from the tagMap.
 *
 * Falls back to classname when no explicit file attribute is present.
 * The key used HERE must exactly match the key produced by extract-tags-junit.js
 * for the same testcase, or tags will never be found.
 */
export function resolveFileKey(testcase: JUnitTestCase, suiteName: string): string {
  if (testcase['@_file']) return testcase['@_file'];
  if (testcase['@_classname']) return testcase['@_classname'];
  return suiteName;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses JUnit XML output (from Pest --log-junit or Pytest --junit-xml) into
 * the normalised internal format.
 *
 * @param raw     Raw JUnit XML content (as a string)
 * @param tagMap  Map of fileKey -> { xrayPlan, xrayFolder, jiraParent }.
 *                Keys must match what resolveFileKey() returns for each testcase,
 *                which is also what extract-tags-junit.js uses as its keys.
 */
export function parseJUnitXmlOutput(raw: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  let root: JUnitRoot;
  try {
    root = parser.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JUnit XML output: ${message}`);
  }

  // Handle both <testsuites> wrapper and bare <testsuite>
  const suites = root.testsuites
    ? asArray(root.testsuites.testsuite)
    : asArray(root.testsuite);

  if (suites.length === 0) {
    throw new Error('Invalid JUnit XML — no <testsuite> elements found');
  }

  // Group by resolved file key across ALL suites combined
  const fileGroups = new Map<string, { testcase: JUnitTestCase; suiteName: string }[]>();

  for (const suite of suites) {
    for (const testcase of asArray(suite.testcase)) {
      const fileKey = resolveFileKey(testcase, suite['@_name']);
      const existing = fileGroups.get(fileKey) ?? [];
      existing.push({ testcase, suiteName: suite['@_name'] });
      fileGroups.set(fileKey, existing);
    }
  }

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const files: NormalisedTestFile[] = Array.from(fileGroups.entries()).map(([fileKey, entries]) => {
    const tags = tagMap[fileKey] ?? {};

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalDuration = 0;
    const failures: TestFailure[] = [];

    for (const { testcase } of entries) {
      // JUnit time is in seconds; convert to milliseconds for consistency with
      // Jest/Mocha which both report in ms
      totalDuration += parseFloat(testcase['@_time'] ?? '0') * 1000;

      if (testcase.skipped !== undefined) {
        skipped++;
      } else if (testcase.failure || testcase.error) {
        failed++;
        const failureNode = Array.isArray(testcase.failure)
          ? testcase.failure[0]
          : testcase.failure ?? testcase.error;
        failures.push({
          testName: testcase['@_name'],
          message: failureNode?.['@_message'] ?? (failureNode?.['#text'] ?? '').split('\n')[0],
        });
      } else {
        passed++;
      }
    }

    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;

    const status: XrayTestStatus = failed > 0 ? 'FAIL' : 'PASS';

    return {
      filePath: fileKey,
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

  const overallStatus: XrayTestStatus = totalFailed > 0 ? 'FAIL' : 'PASS';

  return {
    // JUnit XML doesn't reliably carry a single run-start timestamp at the root
    runAt: new Date().toISOString(),
    files,
    totalPassed,
    totalFailed,
    totalSkipped,
    overallStatus,
  };
}

// ─── Reporter class ────────────────────────────────────────────────────────────

export class JUnitXmlReporter implements TestReporter {
  parse(rawOutput: string, tagMap: Record<string, FileTags> = {}): NormalisedResult {
    return parseJUnitXmlOutput(rawOutput, tagMap);
  }
}