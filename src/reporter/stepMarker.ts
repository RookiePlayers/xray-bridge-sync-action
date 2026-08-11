import { StepResult, TestFailure, XrayTestStatus } from '../types';

// ─── [step:N] marker convention ────────────────────────────────────────────────
// Whole-file-mode generated tests embed a 1-indexed [step:N] marker in each
// it()/test() title (see xray-test-generation.md), e.g. "[step:1] resolves a
// valid tax rate". Shared across jestParser/junitXmlParser/mochaParser so the
// marker regex and step-status mapping stay in one place.

const STEP_MARKER_RE = /^\[step:(\d+)\]\s*/;

export interface StepSource {
  title: string;
  status: XrayTestStatus;
  duration: number;
  failure?: TestFailure;
}

/** Maps a reporter-native pass/fail/pending outcome onto an Xray step status. */
export function mapOutcomeToStepStatus(outcome: 'passed' | 'failed' | 'pending' | 'skipped'): XrayTestStatus {
  if (outcome === 'failed') return 'FAILED';
  if (outcome === 'passed') return 'PASSED';
  return 'TODO'; // pending/skipped — not yet executed, not a blended PASSED
}

/**
 * Extracts [step:N] markers from test titles, building the per-step results
 * for a whole-file-mode Xray Test. Tests with no marker are excluded — they
 * still count toward the file's aggregate totals via the caller's own tally.
 */
export function buildStepResults(sources: StepSource[]): StepResult[] {
  const steps: StepResult[] = [];

  for (const source of sources) {
    const match = source.title?.match(STEP_MARKER_RE);
    if (!match) continue;

    steps.push({
      stepIndex: Number(match[1]),
      status: source.status,
      testTitle: source.title.slice(match[0].length),
      duration: source.duration,
      failure: source.failure,
    });
  }

  return steps.sort((a, b) => a.stepIndex - b.stepIndex);
}
