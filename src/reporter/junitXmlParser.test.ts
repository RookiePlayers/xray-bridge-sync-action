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
    expect(result.overallStatus).toBe('FAIL');
  });

  it('throws on XML with no testsuite elements', () => {
    expect(() => parseJUnitXmlOutput('<testsuites></testsuites>')).toThrow(/no <testsuite> elements/);
  });
});
