import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileTags {
  xrayPlan?: string;
  xrayFolder?: string;
  jiraParent?: string;
}

export type TagMap = Record<string, FileTags>;

// ─── Core tag reading ─────────────────────────────────────────────────────────

/**
 * Reads the first 20 lines of a file's content and extracts any
 * @xray_plan / @xray_folder / @jira_parent comment tags.
 * Supports both // and # comment styles (JS/TS, Python, PHP).
 */
export function extractTagsFromContent(content: string): FileTags {
  const lines = content.split('\n').slice(0, 20);
  const tags: FileTags = {};

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:\/\/|#)\s*@(\w+)\s+(.+)$/);
    if (!match) continue;

    const [, tag, value] = match;
    const clean = value.trim();

    if (tag === 'xray_plan') tags.xrayPlan = clean;
    if (tag === 'xray_folder') tags.xrayFolder = clean;
    if (tag === 'jira_parent') tags.jiraParent = clean;
  }

  return tags;
}

/**
 * Reads a file from disk and extracts its tags.
 * Returns an empty object if the file doesn't exist rather than throwing.
 */
function extractTagsFromFile(filePath: string): FileTags {
  if (!fs.existsSync(filePath)) return {};
  try {
    return extractTagsFromContent(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

// ─── Reporter-specific file path resolution ───────────────────────────────────

/**
 * Resolves a JUnit XML classname to a real file path on disk.
 * Used when a testcase element has no explicit `file` attribute.
 *
 * NOTE: PHP path resolution uses a hardcoded PSR-4 heuristic (Tests\ -> tests/)
 * that works for many Laravel-style projects but is not universal. Verify against
 * the actual target project's composer.json before relying on it in production.
 */
function resolveClassnameToPath(classname: string, language: 'php' | 'python'): string {
  if (language === 'python') {
    // tests.test_auth -> tests/test_auth.py
    return classname.replace(/\./g, '/') + '.py';
  }
  if (language === 'php') {
    // Tests\Feature\AuthTest -> tests/Feature/AuthTest.php
    return classname.replace(/\\\\/g, '/').replace(/^Tests/, 'tests') + '.php';
  }
  return classname;
}

// ─── Public extraction functions (one per reporter) ───────────────────────────

/**
 * Extracts tags from Jest JSON output.
 * Jest groups results by file (testResults[].name), so this is straightforward.
 */
export function extractTagsFromJest(rawResults: string): TagMap {
  let output: any;
  try {
    output = JSON.parse(rawResults);
  } catch {
    throw new Error('Failed to parse Jest JSON for tag extraction');
  }

  const tagMap: TagMap = {};
  const testFiles: any[] = output.testResults ?? [];

  for (const fileResult of testFiles) {
    const filePath: string = fileResult.name;
    if (!filePath) continue;

    const tags = extractTagsFromFile(filePath);
    if (Object.keys(tags).length > 0) {
      tagMap[filePath] = tags;
    }
  }

  return tagMap;
}

/**
 * Extracts tags from Mocha JSON output.
 * Mocha's output is a flat array of tests — each test carries a `file` field.
 * We deduplicate by file path since the same file appears once per test inside it.
 */
export function extractTagsFromMocha(rawResults: string): TagMap {
  let output: any;
  try {
    output = JSON.parse(rawResults);
  } catch {
    throw new Error('Failed to parse Mocha JSON for tag extraction');
  }

  const tagMap: TagMap = {};
  const seenFiles = new Set<string>();
  const tests: any[] = output.tests ?? [];

  for (const test of tests) {
    const filePath: string = test.file;
    if (!filePath || seenFiles.has(filePath)) continue;
    seenFiles.add(filePath);

    const tags = extractTagsFromFile(filePath);
    if (Object.keys(tags).length > 0) {
      tagMap[filePath] = tags;
    }
  }

  return tagMap;
}

/**
 * Extracts tags from JUnit XML output (used by both Pest and Pytest).
 *
 * JUnit testcases don't always carry an explicit `file` attribute — when absent,
 * we fall back to `classname` and resolve it to a real path using language-specific
 * heuristics. The key stored in the tagMap MUST match exactly what junitXmlParser.ts's
 * resolveFileKey() returns for the same testcase — if they diverge, tags will never
 * be found during the sync step.
 *
 * @param rawResults  Raw JUnit XML string
 * @param language    'php' for Pest, 'python' for Pytest — governs path resolution
 */
export function extractTagsFromJUnit(rawResults: string, language: 'php' | 'python'): TagMap {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  let root: any;
  try {
    root = parser.parse(rawResults);
  } catch (err) {
    throw new Error(`Failed to parse JUnit XML for tag extraction: ${err instanceof Error ? err.message : String(err)}`);
  }

  function asArray<T>(v: T | T[] | undefined): T[] {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  const suites = root.testsuites
    ? asArray(root.testsuites.testsuite)
    : asArray(root.testsuite);

  const tagMap: TagMap = {};
  const seenKeys = new Set<string>();

  for (const suite of suites) {
    for (const testcase of asArray(suite.testcase)) {
      // fileKey must match resolveFileKey() in junitXmlParser.ts exactly
      const fileKey: string =
        testcase['@_file'] ??
        testcase['@_classname'] ??
        suite['@_name'];

      if (seenKeys.has(fileKey)) continue;
      seenKeys.add(fileKey);

      // Resolve the actual path on disk for reading the file's content
      const actualPath = testcase['@_file'] ??
        resolveClassnameToPath(
          testcase['@_classname'] ?? suite['@_name'],
          language
        );

      if (!fs.existsSync(actualPath)) {
        console.warn(`[tagExtractor] Skipping — resolved file not found on disk: ${actualPath} (key: ${fileKey})`);
        continue;
      }

      const tags = extractTagsFromContent(fs.readFileSync(actualPath, 'utf-8'));
      if (Object.keys(tags).length > 0) {
        // Store under fileKey (not actualPath) — must match what the parser resolves
        tagMap[fileKey] = tags;
      }
    }
  }

  return tagMap;
}

// ─── Unified entry point ──────────────────────────────────────────────────────

/**
 * Extracts the full tag map from test results for any supported reporter.
 * This is the function src/index.ts calls — it dispatches to the right
 * reporter-specific extractor automatically.
 */
export function extractTags(rawResults: string, reporter: string): TagMap {
  switch (reporter) {
    case 'jest':
      return extractTagsFromJest(rawResults);
    case 'mocha':
      return extractTagsFromMocha(rawResults);
    case 'pest':
      return extractTagsFromJUnit(rawResults, 'php');
    case 'pytest':
      return extractTagsFromJUnit(rawResults, 'python');
    default:
      throw new Error(`Unsupported reporter for tag extraction: ${reporter}`);
  }
}
