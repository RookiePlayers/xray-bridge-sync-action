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
});
