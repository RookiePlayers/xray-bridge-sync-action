/**
 * src/index.bitbucket.ts
 *
 * Bitbucket Pipelines entry point — functionally identical to index.ts but
 * replaces all @actions/core and @actions/exec calls with native Node.js
 * equivalents, since neither package works outside GitHub Actions runners.
 *
 * Inputs come from environment variables instead of action.yml inputs.
 * Secrets come from Bitbucket repository/workspace variables.
 *
 * Required env vars:
 *   XRAY_SERVICE_URL   — URL of your deployed xray-sync-service instance
 *
 * Optional env vars (override .xray-sync.yml values):
 *   XRAY_REPORTER      — jest | mocha | pest | pytest
 *   XRAY_CONFIG_PATH   — path to .xray-sync.yml (default: .xray-sync.yml)
 *   XRAY_WORKING_DIR   — working directory for running tests (default: .)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { extractTags } from './tagExtractor';
import { syncResults, SyncConfig } from './sync';

// ─── Bitbucket-compatible logger ─────────────────────────────────────────────

const log = {
  info: (msg: string) => console.log(`[xray-sync] ${msg}`),
  warn: (msg: string) => console.warn(`[xray-sync] WARNING: ${msg}`),
  error: (msg: string) => console.error(`[xray-sync] ERROR: ${msg}`),
};

function fail(msg: string): never {
  log.error(msg);
  process.exit(1);
}

// ─── Spawn helper (replaces @actions/exec) ───────────────────────────────────

function runCommand(cmd: string, args: string[], cwd?: string): number {
  log.info(`Running: ${cmd} ${args.join(' ')}`);

  const result: SpawnSyncReturns<Buffer> = spawnSync(cmd, args, {
    cwd: cwd ?? process.cwd(),
    stdio: 'inherit',   // pipe stdout/stderr directly to the Bitbucket pipeline log
    env: process.env,
  });

  if (result.error) {
    log.warn(`Command error: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

// ─── Bitbucket environment helpers ───────────────────────────────────────────

function getBitbucketEnv(): {
  commitSha?: string;
  branch?: string;
  runUrl?: string;
} {
  // Bitbucket Pipelines exposes these automatically — no config needed.
  // https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/
  const workspace = process.env.BITBUCKET_WORKSPACE;
  const repo = process.env.BITBUCKET_REPO_SLUG;
  const buildNumber = process.env.BITBUCKET_BUILD_NUMBER;

  return {
    commitSha: process.env.BITBUCKET_COMMIT,
    branch: process.env.BITBUCKET_BRANCH,
    runUrl:
      workspace && repo && buildNumber
        ? `https://bitbucket.org/${workspace}/${repo}/pipelines/results/${buildNumber}`
        : undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface XraySyncConfig {
  project_key: string;
  fix_version: string;
  reporter?: string;
  execution_mode?: string;
  test_results_path?: string;
}

async function run(): Promise<void> {
  // ─── Read inputs from env vars ──────────────────────────────────────────────
  const xrayServiceUrl = process.env.XRAY_SERVICE_URL;
  if (!xrayServiceUrl) fail('XRAY_SERVICE_URL environment variable is required');

  const inputReporter = process.env.XRAY_REPORTER ?? '';
  const configPath    = process.env.XRAY_CONFIG_PATH ?? '.xray-sync.yml';
  const workingDir    = process.env.XRAY_WORKING_DIR ?? '.';

  // ─── Read .xray-sync.yml ────────────────────────────────────────────────────
  const resolvedConfigPath = path.resolve(workingDir, configPath);
  if (!fs.existsSync(resolvedConfigPath)) {
    fail(`.xray-sync.yml not found at ${resolvedConfigPath}`);
  }

  const config = yaml.load(fs.readFileSync(resolvedConfigPath, 'utf-8')) as XraySyncConfig;
  const reporter      = inputReporter || config.reporter || 'jest';
  const resultsPath   = config.test_results_path || './test-results.json';
  const executionMode = config.execution_mode || 'per_run';

  log.info(`Config: project=${config.project_key}, version=${config.fix_version}, reporter=${reporter}`);

  // ─── Change to working directory if specified ───────────────────────────────
  if (workingDir !== '.') {
    process.chdir(workingDir);
    log.info(`Working directory: ${process.cwd()}`);
  }

  // ─── Run tests (reporter-specific) ─────────────────────────────────────────
  let testExitCode = 0;

  if (reporter === 'jest') {
    testExitCode = runCommand('npx', ['jest', '--json', `--outputFile=${resultsPath}`, '--passWithNoTests']);
  } else if (reporter === 'mocha') {
    testExitCode = runCommand('npx', ['mocha', '--reporter', 'json', '--reporter-options', `output=${resultsPath}`]);
  } else if (reporter === 'pest') {
    testExitCode = runCommand('./vendor/bin/pest', [`--log-junit=${resultsPath}`]);
  } else if (reporter === 'pytest') {
    testExitCode = runCommand('python', ['-m', 'pytest', `--junit-xml=${resultsPath}`]);
  } else {
    fail(`Unsupported reporter: ${reporter}. Supported: jest, mocha, pest, pytest`);
  }

  if (!fs.existsSync(resultsPath)) {
    fail(`Test results file not found at ${resultsPath} — did the test command run?`);
  }

  const rawResults = fs.readFileSync(resultsPath, 'utf-8');

  // ─── Extract tags ────────────────────────────────────────────────────────────
  const tagMap = extractTags(rawResults, reporter);
  log.info(`Tag map: ${Object.keys(tagMap).length} tagged file(s)`);

  // ─── Sync to Xray ────────────────────────────────────────────────────────────
  const syncConfig: SyncConfig = {
    project_key:    config.project_key,
    fix_version:    config.fix_version,
    reporter,
    execution_mode: executionMode,
  };

  const bbEnv = getBitbucketEnv();

  const result = await syncResults(
    xrayServiceUrl!,
    syncConfig,
    rawResults,
    tagMap,
    bbEnv.commitSha,
    bbEnv.branch,
    bbEnv.runUrl
  );

  log.info(`Execution key: ${result.executionKey}`);
  log.info(`Overall status: ${result.overallStatus}`);
  log.info(`Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);

  // ─── Print summary ───────────────────────────────────────────────────────────
  console.log('');
  console.log('─── Xray Sync Summary ───────────────────────────────────────');
  console.log(`  Execution:  ${result.executionKey}`);
  console.log(`  Status:     ${result.overallStatus}`);
  console.log(`  Branch:     ${bbEnv.branch ?? 'unknown'}`);
  console.log(`  Commit:     ${bbEnv.commitSha ?? 'unknown'}`);
  if (bbEnv.runUrl) console.log(`  Pipeline:   ${bbEnv.runUrl}`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');

  // ─── Fail the pipeline if tests failed ───────────────────────────────────────
  if (testExitCode !== 0) {
    fail(`Tests failed — see Xray execution ${result.executionKey} for details`);
  }
}

run().catch(err => {
  fail(err instanceof Error ? err.message : String(err));
});