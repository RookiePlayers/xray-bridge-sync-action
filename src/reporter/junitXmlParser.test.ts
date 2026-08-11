import { parseJUnitXmlOutput } from './junitXmlParser';

describe('parseJUnitXmlOutput', () => {
  const raw = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="Tests\\Feature\\AuthTest" tests="2" failures="1">
    <testcase classname="Tests\\Feature\\AuthTest" name="it logs in" time="0.12"/>
    <testcase classname="Tests\\Feature\\AuthTest" name="it rejects bad password" time="0.05">
      <failure message="expected 401 got 200"/>
    </testcase>
  </testsuite>
</testsuites>`;

  it('groups testcases by classname and computes pass/fail counts', () => {
    const result = parseJUnitXmlOutput(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].passed).toBe(1);
    expect(result.files[0].failed).toBe(1);
    expect(result.overallStatus).toBe('FAILED');
  });

  it('throws on XML with no testsuite elements', () => {
    expect(() => parseJUnitXmlOutput('<testsuites></testsuites>')).toThrow(/no <testsuite> elements/);
  });

  describe('per-block mode (2+ @xray_test tags)', () => {
    const blockRaw = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="Tests\\Feature\\AuthTest" tests="3" failures="1">
    <testcase classname="Tests\\Feature\\AuthTest" name="it logs in" time="0.12"/>
    <testcase classname="Tests\\Feature\\AuthTest" name="it rejects bad password" time="0.05">
      <failure message="expected 401 got 200"/>
    </testcase>
    <testcase classname="Tests\\Feature\\AuthTest" name="it does something untagged" time="0.02"/>
  </testsuite>
</testsuites>`;

    it('splits the file into one entry per tagged testcase, ignoring untagged ones', () => {
      const result = parseJUnitXmlOutput(blockRaw, {
        'Tests\\Feature\\AuthTest': {
          xrayPlan: 'DTV-149',
          xrayTests: [
            { key: 'DTV-150', title: 'it logs in' },
            { key: 'DTV-151', title: 'it rejects bad password' },
          ],
        },
      });

      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({ xrayTest: 'DTV-150', testTitle: 'it logs in', passed: 1, failed: 0 });
      expect(result.files[1]).toMatchObject({ xrayTest: 'DTV-151', testTitle: 'it rejects bad password', passed: 0, failed: 1 });
      expect(result.parseWarnings).toEqual([]);
    });

    it('records a parse warning when a block tag has no matching testcase name', () => {
      const result = parseJUnitXmlOutput(blockRaw, {
        'Tests\\Feature\\AuthTest': {
          xrayTests: [
            { key: 'DTV-150', title: 'it logs in' },
            { key: 'DTV-999', title: 'it does not exist' },
          ],
        },
      });

      expect(result.files).toHaveLength(1);
      expect(result.parseWarnings).toEqual([expect.stringContaining('DTV-999')]);
    });
  });

  describe('whole-file mode with [step:N] markers', () => {
    const stepRaw = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="Tests\\Feature\\TaxTest" tests="3" failures="1" skipped="1">
    <testcase classname="Tests\\Feature\\TaxTest" name="[step:2] returns default for a missing rate" time="0.004">
      <failure message="expected 0 got null"/>
    </testcase>
    <testcase classname="Tests\\Feature\\TaxTest" name="[step:1] resolves a valid tax rate" time="0.006"/>
    <testcase classname="Tests\\Feature\\TaxTest" name="unmarked helper test" time="0.001">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;

    it('emits ordered step results parsed from [step:N] markers, excluding unmarked tests', () => {
      const result = parseJUnitXmlOutput(stepRaw);

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
      const result = parseJUnitXmlOutput(raw);
      expect(result.files[0].steps).toBeUndefined();
    });
  });
});
