import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractTags } from './tagExtractor';

describe('extractTags', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-tag-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads @xray_plan/@xray_test/@xray_folder/@jira_parent tags from Jest test files', () => {
    const testFile = path.join(dir, 'login.test.js');
    fs.writeFileSync(
      testFile,
      [
        '// @xray_plan DTV-149',
        '// @xray_test DTV-33',
        '// @xray_folder /Authentication/Login',
        '// @jira_parent DTV-15',
        "test('x', () => {})",
      ].join('\n')
    );

    const raw = JSON.stringify({ testResults: [{ name: testFile }] });
    const tagMap = extractTags(raw, 'jest');

    expect(tagMap[testFile]).toEqual({
      xrayPlan: 'DTV-149',
      xrayTest: 'DTV-33',
      xrayFolder: '/Authentication/Login',
      jiraParent: 'DTV-15',
    });
  });

  it('skips files with no tags and files that do not exist on disk', () => {
    const untagged = path.join(dir, 'untagged.test.js');
    fs.writeFileSync(untagged, "test('x', () => {})");

    const raw = JSON.stringify({ testResults: [{ name: untagged }, { name: path.join(dir, 'missing.test.js') }] });
    const tagMap = extractTags(raw, 'jest');

    expect(tagMap).toEqual({});
  });

  it('deduplicates Mocha files across the flat tests array', () => {
    const testFile = path.join(dir, 'suite.test.js');
    fs.writeFileSync(testFile, '# @xray_plan DTV-2\n');

    const raw = JSON.stringify({ tests: [{ file: testFile }, { file: testFile }] });
    const tagMap = extractTags(raw, 'mocha');

    expect(Object.keys(tagMap)).toEqual([testFile]);
  });

  it('rejects unsupported reporters', () => {
    expect(() => extractTags('{}', 'cypress')).toThrow(/Unsupported reporter/);
  });

  it('switches to per-block mode when a file has 2+ @xray_test tags, pairing each with its following it() block', () => {
    const testFile = path.join(dir, 'analytics.test.js');
    fs.writeFileSync(
      testFile,
      [
        '// @xray_plan DTV-149',
        '// @xray_folder Backend/Analytics',
        '// @jira_parent DTV-8',
        '',
        "describe('fetchAnalyticsSummary', () => {",
        '  // @xray_test DTV-150',
        "  it('aggregates totals from GA4 responses', async () => {});",
        '',
        '  // @xray_test DTV-151',
        "  it('requests the correct GA4 property', async () => {});",
        '',
        "  it('rejects when the GA4 client throws', async () => {});",
        '});',
      ].join('\n')
    );

    const raw = JSON.stringify({ testResults: [{ name: testFile }] });
    const tagMap = extractTags(raw, 'jest');

    expect(tagMap[testFile]).toEqual({
      xrayPlan: 'DTV-149',
      xrayFolder: 'Backend/Analytics',
      jiraParent: 'DTV-8',
      xrayTests: [
        { key: 'DTV-150', title: 'aggregates totals from GA4 responses' },
        { key: 'DTV-151', title: 'requests the correct GA4 property' },
      ],
    });
  });

  it('keeps whole-file aggregate mode when only one @xray_test tag exists, regardless of position in the file', () => {
    const testFile = path.join(dir, 'single.test.js');
    fs.writeFileSync(
      testFile,
      [
        "describe('suite', () => {",
        "  it('does something unrelated', () => {});",
        '',
        '  // @xray_test DTV-99',
        "  it('does the tagged thing', () => {});",
        '});',
      ].join('\n')
    );

    const raw = JSON.stringify({ testResults: [{ name: testFile }] });
    const tagMap = extractTags(raw, 'jest');

    expect(tagMap[testFile]).toEqual({ xrayTest: 'DTV-99' });
  });
});
