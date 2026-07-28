import { parseJestOutput } from './jestParser';

describe('parseJestOutput', () => {
  const raw = JSON.stringify({
    startTime: 1700000000000,
    numPassedTests: 1,
    numFailedTests: 1,
    numPendingTests: 0,
    testResults: [
      {
        name: '/repo/src/foo.test.js',
        startTime: 1700000000000,
        endTime: 1700000000100,
        status: 'failed',
        assertionResults: [
          { fullName: 'foo passes', status: 'passed', failureMessages: [] },
          { fullName: 'foo fails', status: 'failed', failureMessages: ['Expected: 1\nReceived: 2'] },
        ],
      },
    ],
  });

  it('normalises passed/failed counts and overall status', () => {
    const result = parseJestOutput(raw);
    expect(result.overallStatus).toBe('FAILED');
    expect(result.totalPassed).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].failed).toBe(1);
    expect(result.files[0].failures[0].expected).toBe('1');
    expect(result.files[0].failures[0].received).toBe('2');
  });

  it('merges tags from the provided tagMap by file path', () => {
    const result = parseJestOutput(raw, {
      '/repo/src/foo.test.js': { xrayPlan: 'DTV-1', xrayTest: 'DTV-33', xrayFolder: '/Smoke' },
    });
    expect(result.files[0].xrayPlan).toBe('DTV-1');
    expect(result.files[0].xrayTest).toBe('DTV-33');
    expect(result.files[0].xrayFolder).toBe('/Smoke');
  });

  it('throws a clear error on malformed input', () => {
    expect(() => parseJestOutput('{"nope": true}')).toThrow(/missing or non-array testResults/);
  });

  describe('per-block mode (2+ @xray_test tags)', () => {
    const blockRaw = JSON.stringify({
      startTime: 1700000000000,
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [
        {
          name: '/repo/src/analytics.test.js',
          startTime: 1700000000000,
          endTime: 1700000000100,
          status: 'failed',
          assertionResults: [
            { title: 'aggregates totals', fullName: 'suite aggregates totals', status: 'passed', failureMessages: [], duration: 12 },
            { title: 'requests the correct property', fullName: 'suite requests the correct property', status: 'failed', failureMessages: ['Expected: 401\nReceived: 500'], duration: 8 },
            { title: 'untagged test', fullName: 'suite untagged test', status: 'passed', failureMessages: [], duration: 3 },
          ],
        },
      ],
    });

    it('splits the file into one entry per tagged block, ignoring untagged blocks', () => {
      const result = parseJestOutput(blockRaw, {
        '/repo/src/analytics.test.js': {
          xrayPlan: 'DTV-149',
          xrayTests: [
            { key: 'DTV-150', title: 'aggregates totals' },
            { key: 'DTV-151', title: 'requests the correct property' },
          ],
        },
      });

      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({
        xrayTest: 'DTV-150',
        xrayPlan: 'DTV-149',
        testTitle: 'aggregates totals',
        passed: 1,
        failed: 0,
        status: 'PASSED',
      });
      expect(result.files[1]).toMatchObject({
        xrayTest: 'DTV-151',
        testTitle: 'requests the correct property',
        passed: 0,
        failed: 1,
        status: 'FAILED',
      });
      expect(result.files[1].failures[0].expected).toBe('401');
      expect(result.parseWarnings).toEqual([]);
    });

    it('records a parse warning when a block tag has no matching title in the results', () => {
      const result = parseJestOutput(blockRaw, {
        '/repo/src/analytics.test.js': {
          xrayTests: [
            { key: 'DTV-150', title: 'aggregates totals' },
            { key: 'DTV-999', title: 'does not exist anywhere' },
          ],
        },
      });

      expect(result.files).toHaveLength(1);
      expect(result.parseWarnings).toEqual([
        expect.stringContaining('DTV-999'),
      ]);
    });
  });
});
