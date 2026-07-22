import * as core from '@actions/core';
import * as fs from 'fs';
import { TagMap } from './tagExtractor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncConfig {
  project_key: string;
  fix_version: string;
  reporter: string;
  execution_mode: string;
}

export interface SyncResult {
  executionKey: string;
  executionId: string;
  overallStatus: 'PASS' | 'FAIL';
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  updatedRuns: Array<{ testKey: string; status: string; comment?: string }>;
  warnings: string[];
}

export interface SyncPayload {
  config: SyncConfig;
  rawResults: string;
  tagMap: TagMap;
  commitSha?: string;
  branch?: string;
  runUrl?: string;
}

// ─── Main sync function ───────────────────────────────────────────────────────

/**
 * Builds the payload and POSTs it to the xray-sync-service /xray/sync-results
 * endpoint. Writes the payload to a temp file first to avoid any command-line
 * size limits (same pattern as the workflow's curl -d @file approach).
 */
export async function syncResults(
  xrayServiceUrl: string,
  config: SyncConfig,
  rawResults: string,
  tagMap: TagMap
): Promise<SyncResult> {
  const payload: SyncPayload = {
    config,
    rawResults,
    tagMap,
    commitSha: process.env.GITHUB_SHA,
    branch: process.env.GITHUB_REF_NAME,
    runUrl: buildRunUrl(),
  };

  core.info(`Syncing to Xray: project=${config.project_key}, version=${config.fix_version}, reporter=${config.reporter}`);
  core.info(`Tag map: ${Object.keys(tagMap).length} tagged file(s)`);

  const payloadPath = './xray-payload.json';
  fs.writeFileSync(payloadPath, JSON.stringify(payload));
  core.info(`Payload size: ${fs.statSync(payloadPath).size} bytes`);

  const response = await fetch(`${xrayServiceUrl.replace(/\/$/, '')}/xray/sync-results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: fs.readFileSync(payloadPath),
  });

  const body = await response.json() as any;

  if (!response.ok) {
    throw new Error(
      `Xray sync failed (${response.status}): ${JSON.stringify(body)}`
    );
  }

  const result: SyncResult = body.result;

  // Surface any warnings from the service (e.g. files skipped due to missing
  // @xray_plan tags, failed Jira parent link attempts, etc.)
  if (result.warnings?.length) {
    for (const warning of result.warnings) {
      core.warning(warning);
    }
  }

  core.info(`Synced — Execution: ${result.executionKey}, Status: ${result.overallStatus}`);
  core.info(`Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRunUrl(): string | undefined {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  if (!server || !repo || !runId) return undefined;
  return `${server}/${repo}/actions/runs/${runId}`;
}
