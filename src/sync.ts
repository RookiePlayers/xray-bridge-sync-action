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
  overallStatus: 'PASSED' | 'FAILED';
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
  tagMap: TagMap,
  commitShaOverride?: string,   // NEW — used by Bitbucket entry point
  branchOverride?: string,       // NEW
  runUrlOverride?: string        // NEW
): Promise<SyncResult> {
  const payload: SyncPayload = {
    config,
    rawResults,
    tagMap,
    commitSha: commitShaOverride ?? process.env.GITHUB_SHA,
    branch:    branchOverride    ?? process.env.GITHUB_REF_NAME,
    runUrl:    runUrlOverride    ?? buildRunUrl(),
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

  // Read as text first — a non-JSON response (wrong URL, auth wall, proxy error
  // page, or the service crashing on this payload with no catch-all error
  // handler) must not surface as a bare "Unexpected token '<'" JSON parse
  // error with no indication of what actually came back.
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? 'unknown';

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Xray sync failed (${response.status} ${response.statusText}): service returned ` +
      `non-JSON response (content-type: ${contentType}). This usually means ` +
      `xray_service_url is wrong, the request hit an auth wall, or the service ` +
      `threw an unhandled error processing this payload — check xray_service_url ` +
      `and the service's own logs. First 500 chars of body:\n${rawBody.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Xray sync failed (${response.status}): ${JSON.stringify(body)}`
    );
  }

  const result: SyncResult = body.result;

  // Surface any warnings from the service (e.g. files skipped due to missing
  // @xray_test tags, failed Jira parent link attempts, etc.)
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
