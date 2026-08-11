import { parseMochaOutput } from './mochaParser';

describe('parseMochaOutput', () => {
  const raw = JSON.stringify({
    stats: { suites: 1, tests: 2, passes: 1, pending: 0, failures: 1, start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T00:00:01.000Z' },
    tests: [
      { title: 'passes', fullTitle: 'suite passes', file: '/repo/src/foo.test.js', duration: 5 },
      { title: 'fails', fullTitle: 'suite fails', file: '/repo/src/foo.test.js', duration: 3, err: { message: 'expected 1 got 2' } },
    ],
    pending: [],
    failures: [{ title: 'fails', fullTitle: 'suite fails', file: '/repo/src/foo.test.js' }],
    passes: [{ title: 'passes', fullTitle: 'suite passes', file: '/repo/src/foo.test.js' }],
  });

  it('groups the flat tests array by file and computes pass/fail counts', () => {
    const result = parseMochaOutput(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].passed).toBe(1);
    expect(result.files[0].failed).toBe(1);
    expect(result.overallStatus).toBe('FAILED');
    expect(result.parseWarnings).toEqual([]);
  });

  describe('per-block mode (2+ @xray_test tags)', () => {
    it('splits the file into one entry per tagged test, ignoring untagged ones', () => {
      const result = parseMochaOutput(raw, {
        '/repo/src/foo.test.js': {
          xrayPlan: 'DTV-149',
          xrayTests: [
            { key: 'DTV-150', title: 'passes' },
            { key: 'DTV-151', title: 'fails' },
          ],
        },
      });

      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({ xrayTest: 'DTV-150', testTitle: 'passes', passed: 1, failed: 0 });
      expect(result.files[1]).toMatchObject({ xrayTest: 'DTV-151', testTitle: 'fails', passed: 0, failed: 1 });
      expect(result.parseWarnings).toEqual([]);
    });

    it('records a parse warning when a block tag has no matching test title', () => {
      const result = parseMochaOutput(raw, {
        '/repo/src/foo.test.js': {
          xrayTests: [
            { key: 'DTV-150', title: 'passes' },
            { key: 'DTV-999', title: 'does not exist' },
          ],
        },
      });

      expect(result.files).toHaveLength(1);
      expect(result.parseWarnings).toEqual([expect.stringContaining('DTV-999')]);
    });
  });

  describe('whole-file mode with [step:N] markers', () => {
    const stepRaw = JSON.stringify({
      stats: { suites: 1, tests: 3, passes: 1, pending: 1, failures: 1, start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T00:00:01.000Z' },
      tests: [
        { title: '[step:2] returns default for a missing rate', fullTitle: 'suite [step:2] returns default for a missing rate', file: '/repo/src/tax.test.js', duration: 4, err: { message: 'expected 0 got undefined' } },
        { title: '[step:1] resolves a valid tax rate', fullTitle: 'suite [step:1] resolves a valid tax rate', file: '/repo/src/tax.test.js', duration: 6 },
        { title: 'unmarked helper test', fullTitle: 'suite unmarked helper test', file: '/repo/src/tax.test.js' },
      ],
      pending: [{ title: 'unmarked helper test', fullTitle: 'suite unmarked helper test', file: '/repo/src/tax.test.js' }],
      failures: [{ title: '[step:2] returns default for a missing rate', fullTitle: 'suite [step:2] returns default for a missing rate', file: '/repo/src/tax.test.js' }],
      passes: [{ title: '[step:1] resolves a valid tax rate', fullTitle: 'suite [step:1] resolves a valid tax rate', file: '/repo/src/tax.test.js' }],
    });

    it('emits ordered step results parsed from [step:N] markers, excluding unmarked tests', () => {
      const result = parseMochaOutput(stepRaw);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].passed).toBe(1);
      expect(result.files[0].failed).toBe(1);
      expect(result.files[0].skipped).toBe(1);
      expect(result.files[0].steps).toEqual([
        expect.objectContaining({ stepIndex: 1, status: 'PASSED', testTitle: 'resolves a valid tax rate', duration: 6 }),
        expect.objectContaining({ stepIndex: 2, status: 'FAILED', testTitle: 'returns default for a missing rate', duration: 4 }),
      ]);
    });

    it('omits the steps field entirely when no test has a marker', () => {
      const result = parseMochaOutput(raw);
      expect(result.files[0].steps).toBeUndefined();
    });
  });
});
