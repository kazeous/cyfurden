import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPlatformCurrentHealth,
  createPlatformCurrentHealthReader,
  normalizePlatformReleaseId,
} from "../lib/platform-health-contract";

test("current health normalizes successful bounded dependency checks", async () => {
  const checkedAt = new Date("2026-08-13T08:00:00.000Z");
  const health = await collectPlatformCurrentHealth({
    checkedAt,
    releaseId: "6acf5bb",
    probes: {
      database: async () => undefined,
      oracle: async () => undefined,
    },
  });

  assert.equal(health.releaseId, "6acf5bb");
  assert.equal(health.application.state, "HEALTHY");
  assert.equal(health.postgresql.state, "HEALTHY");
  assert.equal(health.oracle.state, "HEALTHY");
  assert.equal(health.checkedAt.toISOString(), checkedAt.toISOString());
  assert.equal(health.cacheExpiresAt.getTime() - checkedAt.getTime(), 15_000);
});

test("current health maps timeouts and outages without returning raw errors", async () => {
  const timeout = await collectPlatformCurrentHealth({
    releaseId: "phase17e-test",
    timeoutMs: 5,
    probes: {
      database: async () => new Promise<void>(() => undefined),
      oracle: async () => new Promise<void>(() => undefined),
    },
  });
  assert.deepEqual(
    [timeout.postgresql.errorCode, timeout.oracle.errorCode],
    ["POSTGRES_TIMEOUT", "ORACLE_TIMEOUT"],
  );

  const outage = await collectPlatformCurrentHealth({
    releaseId: "phase17e-test",
    probes: {
      database: async () => {
        throw new Error("postgresql://private-credential");
      },
      oracle: async () => {
        throw new Error("private Oracle endpoint and bucket");
      },
    },
  });
  assert.equal(outage.postgresql.state, "UNAVAILABLE");
  assert.equal(outage.postgresql.errorCode, "POSTGRES_UNAVAILABLE");
  assert.equal(outage.oracle.state, "UNAVAILABLE");
  assert.equal(outage.oracle.errorCode, "ORACLE_UNAVAILABLE");
  assert.doesNotMatch(
    JSON.stringify(outage),
    /private-credential|private Oracle endpoint|bucket/,
  );
});

test("current health distinguishes Oracle denial and missing configuration", async () => {
  const denied = await collectPlatformCurrentHealth({
    releaseId: "phase17e-test",
    probes: {
      database: async () => undefined,
      oracle: async () => {
        throw Object.assign(new Error("raw secret provider response"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        });
      },
    },
  });
  assert.equal(denied.oracle.state, "DEGRADED");
  assert.equal(denied.oracle.errorCode, "ORACLE_ACCESS_DENIED");
  assert.doesNotMatch(JSON.stringify(denied), /raw secret provider response/);

  const unconfigured = await collectPlatformCurrentHealth({
    releaseId: "phase17e-test",
    probes: { database: async () => undefined },
  });
  assert.equal(unconfigured.oracle.state, "UNKNOWN");
  assert.equal(unconfigured.oracle.errorCode, "ORACLE_NOT_CONFIGURED");
});

test("release identity accepts only bounded non-secret identifiers", () => {
  assert.equal(
    normalizePlatformReleaseId(" release/6acf5bb "),
    "release/6acf5bb",
  );
  assert.equal(normalizePlatformReleaseId("release id with spaces"), null);
  assert.equal(normalizePlatformReleaseId("secret=value"), null);
});

test("current health shares in-flight work and rate-limits reads until freshness expires", async () => {
  let now = new Date("2026-08-13T08:00:00.000Z").getTime();
  let calls = 0;
  let releaseLoad: (() => void) | undefined;
  const waitForRelease = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  const reader = createPlatformCurrentHealthReader(
    async () => {
      calls += 1;
      if (calls === 1) await waitForRelease;
      return collectPlatformCurrentHealth({
        checkedAt: new Date(now),
        releaseId: "phase17e-cache-test",
        probes: { database: async () => undefined },
      });
    },
    () => now,
  );

  const firstRead = reader();
  const concurrentRead = reader();
  assert.equal(calls, 1);
  releaseLoad?.();
  const [first, concurrent] = await Promise.all([firstRead, concurrentRead]);
  assert.strictEqual(concurrent, first);
  assert.strictEqual(await reader(), first);
  assert.equal(calls, 1);

  now = first.cacheExpiresAt.getTime();
  const refreshed = await reader();
  assert.equal(calls, 2);
  assert.notStrictEqual(refreshed, first);
  assert.equal(refreshed.checkedAt.getTime(), now);
});
