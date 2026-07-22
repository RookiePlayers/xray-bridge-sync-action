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

  it('reads @xray_plan/@xray_folder/@jira_parent tags from Jest test files', () => {
    const testFile = path.join(dir, 'login.test.js');
    fs.writeFileSync(
      testFile,
      ['// @xray_plan DTV-33', '// @xray_folder /Authentication/Login', '// @jira_parent DTV-15', "test('x', () => {})"].join('\n')
    );

    const raw = JSON.stringify({ testResults: [{ name: testFile }] });
    const tagMap = extractTags(raw, 'jest');

    expect(tagMap[testFile]).toEqual({
      xrayPlan: 'DTV-33',
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
});
