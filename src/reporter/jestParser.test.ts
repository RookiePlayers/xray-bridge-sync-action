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
    expect(result.overallStatus).toBe('FAIL');
    expect(result.totalPassed).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].failed).toBe(1);
    expect(result.files[0].failures[0].expected).toBe('1');
    expect(result.files[0].failures[0].received).toBe('2');
  });

  it('merges tags from the provided tagMap by file path', () => {
    const result = parseJestOutput(raw, {
      '/repo/src/foo.test.js': { xrayPlan: 'DTV-1', xrayFolder: '/Smoke' },
    });
    expect(result.files[0].xrayPlan).toBe('DTV-1');
    expect(result.files[0].xrayFolder).toBe('/Smoke');
  });

  it('throws a clear error on malformed input', () => {
    expect(() => parseJestOutput('{"nope": true}')).toThrow(/missing or non-array testResults/);
  });
});
