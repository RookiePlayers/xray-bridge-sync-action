import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { extractTags } from './tagExtractor';
import { getReporter } from './reporter/reporterFactory';
import { syncResults, SyncConfig } from './sync';

interface XraySyncConfig {
  project_key: string;
  fix_version: string;
  reporter?: string;
  execution_mode?: string;
  test_results_path?: string;
}

async function run(): Promise<void> {
  try {
    // ─── Read inputs ──────────────────────────────────────────────────────────
    const xrayServiceUrl = core.getInput('xray_service_url', { required: true });
    const inputReporter = core.getInput('reporter');
    const configPath = core.getInput('config_path') || '.xray-sync.yml';
    const workingDir = core.getInput('working_directory') || '.';

    // ─── Read .xray-sync.yml ─────────────────────────────────────────────────
    if (!fs.existsSync(configPath)) {
      core.setFailed(`.xray-sync.yml not found at ${configPath}`);
      return;
    }

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as XraySyncConfig;
    const reporter = inputReporter || config.reporter || 'jest';
    const resultsPath = config.test_results_path || './test-results.json';
    const executionMode = config.execution_mode || 'per_run';

    core.info(`Config: project=${config.project_key}, version=${config.fix_version}, reporter=${reporter}`);

    // ─── Run tests (reporter-specific) ───────────────────────────────────────
    if (workingDir !== '.') process.chdir(workingDir);

    let testExitCode = 0;

    if (reporter === 'jest') {
      testExitCode = await exec.exec(
        'npx', ['jest', '--json', `--outputFile=${resultsPath}`, '--passWithNoTests'],
        { ignoreReturnCode: true }
      );
    } else if (reporter === 'mocha') {
      testExitCode = await exec.exec(
        'npx', ['mocha', '--reporter', 'json', '--reporter-options', `output=${resultsPath}`],
        { ignoreReturnCode: true }
      );
    } else if (reporter === 'pest') {
      testExitCode = await exec.exec(
        './vendor/bin/pest', [`--log-junit=${resultsPath}`],
        { ignoreReturnCode: true }
      );
    } else if (reporter === 'pytest') {
      testExitCode = await exec.exec(
        'python', ['-m', 'pytest', `--junit-xml=${resultsPath}`],
        { ignoreReturnCode: true }
      );
    } else {
      core.setFailed(`Unsupported reporter: ${reporter}. Supported: jest, mocha, pest, pytest`);
      return;
    }

    if (!fs.existsSync(resultsPath)) {
      core.setFailed(`Test results file not found at ${resultsPath}`);
      return;
    }

    const rawResults = fs.readFileSync(resultsPath, 'utf-8');

    // ─── Extract tags ─────────────────────────────────────────────────────────
    const tagMap = extractTags(rawResults, reporter);

    // ─── Sync to Xray ─────────────────────────────────────────────────────────
    const syncConfig: SyncConfig = {
      project_key: config.project_key,
      fix_version: config.fix_version,
      reporter,
      execution_mode: executionMode,
    };

    const result = await syncResults(xrayServiceUrl, syncConfig, rawResults, tagMap);

    // ─── Set outputs ──────────────────────────────────────────────────────────
    core.setOutput('execution_key', result.executionKey ?? 'unknown');
    core.setOutput('overall_status', result.overallStatus ?? 'unknown');

    // ─── Job summary ──────────────────────────────────────────────────────────
    await core.summary
      .addHeading('Test Results')
      .addTable([
        [{ data: 'Field', header: true }, { data: 'Value', header: true }],
        ['Branch', process.env.GITHUB_REF_NAME ?? ''],
        ['Commit', process.env.GITHUB_SHA ?? ''],
        ['Xray Execution', result.executionKey ?? 'unknown'],
        ['Overall Status', result.overallStatus ?? 'unknown'],
      ])
      .write();

    // ─── Fail the job if tests failed ─────────────────────────────────────────
    if (testExitCode !== 0) {
      core.setFailed(`Tests failed — see Xray execution ${result.executionKey} for details`);
    }

  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
