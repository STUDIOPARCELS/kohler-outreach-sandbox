import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETED_RUN_MAX_AGE_HOURS,
  JOB_ACTIVITY_MAX_AGE_HOURS,
  evaluateFreshness,
} from "./check-freshness.mjs";

const NOW = new Date("2026-07-02T15:00:00.000Z");

function hoursAgo(hours) {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function healthyInput(overrides = {}) {
  return {
    now: NOW,
    latestCompletedRun: {
      started_at: hoursAgo(2),
      finished_at: hoursAgo(1),
      status: "completed",
    },
    stuckRunningRuns: [],
    hasRecentJobActivity: true,
    ...overrides,
  };
}

test("passes when a run completed recently, nothing is stuck, and jobs are fresh", () => {
  const result = evaluateFreshness(healthyInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("accepts completed_with_errors as a completed run", () => {
  const result = evaluateFreshness(
    healthyInput({
      latestCompletedRun: { started_at: hoursAgo(5), finished_at: hoursAgo(4), status: "completed_with_errors" },
    })
  );
  assert.equal(result.ok, true);
});

test("fails when no completed run exists at all", () => {
  const result = evaluateFreshness(healthyInput({ latestCompletedRun: null }));
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /no completed sync run/);
  assert.match(result.failures[0], /no completed\/completed_with_errors rows found/);
});

test("fails when the latest completed run is older than 48h", () => {
  const result = evaluateFreshness(
    healthyInput({
      latestCompletedRun: {
        started_at: hoursAgo(COMPLETED_RUN_MAX_AGE_HOURS + 2),
        finished_at: hoursAgo(COMPLETED_RUN_MAX_AGE_HOURS + 1),
        status: "completed",
      },
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /no completed sync run in the last 48h/);
});

test("passes when the latest completed run is just inside the 48h window", () => {
  const result = evaluateFreshness(
    healthyInput({
      latestCompletedRun: {
        started_at: hoursAgo(COMPLETED_RUN_MAX_AGE_HOURS),
        finished_at: hoursAgo(COMPLETED_RUN_MAX_AGE_HOURS - 1),
        status: "completed",
      },
    })
  );
  assert.equal(result.ok, true);
});

test("falls back to started_at when finished_at is null", () => {
  const fresh = evaluateFreshness(
    healthyInput({
      latestCompletedRun: { started_at: hoursAgo(3), finished_at: null, status: "completed" },
    })
  );
  assert.equal(fresh.ok, true);

  const stale = evaluateFreshness(
    healthyInput({
      latestCompletedRun: {
        started_at: hoursAgo(COMPLETED_RUN_MAX_AGE_HOURS + 1),
        finished_at: null,
        status: "completed",
      },
    })
  );
  assert.equal(stale.ok, false);
});

test("fails when any run is stuck in running for over 2h", () => {
  const result = evaluateFreshness(
    healthyInput({
      stuckRunningRuns: [
        { id: "b", provider: "careers", started_at: hoursAgo(3) },
        { id: "a", provider: "careers", started_at: hoursAgo(26) },
      ],
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /2 sync run\(s\) stuck in status "running"/);
  assert.ok(result.failures[0].includes(hoursAgo(26)), "reports the oldest stuck run");
});

test("fails when no job_listings activity in the last 72h", () => {
  const result = evaluateFreshness(healthyInput({ hasRecentJobActivity: false }));
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(
    result.failures[0],
    new RegExp(`last_seen_at or first_seen_at in the last ${JOB_ACTIVITY_MAX_AGE_HOURS}h`)
  );
});

test("reports all failures together when everything is broken", () => {
  const result = evaluateFreshness({
    now: NOW,
    latestCompletedRun: null,
    stuckRunningRuns: [{ id: "x", provider: "careers", started_at: hoursAgo(50) }],
    hasRecentJobActivity: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 3);
});
