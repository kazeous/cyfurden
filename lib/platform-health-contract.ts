import { performance } from "node:perf_hooks";

export const PLATFORM_HEALTH_PROBE_TIMEOUT_MS = 2_000;
export const PLATFORM_HEALTH_CACHE_TTL_MS = 15_000;

export const platformHealthStates = [
  "HEALTHY",
  "DEGRADED",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;

export type PlatformHealthState = (typeof platformHealthStates)[number];

export type PlatformHealthSafeErrorCode =
  | "RELEASE_ID_UNAVAILABLE"
  | "POSTGRES_TIMEOUT"
  | "POSTGRES_UNAVAILABLE"
  | "ORACLE_NOT_CONFIGURED"
  | "ORACLE_TIMEOUT"
  | "ORACLE_ACCESS_DENIED"
  | "ORACLE_UNAVAILABLE";

export type PlatformHealthDependency = {
  state: PlatformHealthState;
  latencyMs: number | null;
  checkedAt: Date;
  errorCode: PlatformHealthSafeErrorCode | null;
};

export type PlatformCurrentHealth = {
  checkedAt: Date;
  cacheExpiresAt: Date;
  releaseId: string | null;
  application: PlatformHealthDependency;
  postgresql: PlatformHealthDependency;
  oracle: PlatformHealthDependency;
};

export type PlatformHealthProbe = (signal: AbortSignal) => Promise<void>;

export type PlatformHealthProbeSet = {
  database: PlatformHealthProbe;
  oracle?: PlatformHealthProbe;
};

export function createPlatformCurrentHealthReader(
  load: () => Promise<PlatformCurrentHealth>,
  now: () => number = Date.now,
) {
  let cached: PlatformCurrentHealth | undefined;
  let inFlight: Promise<PlatformCurrentHealth> | undefined;

  return async function readPlatformCurrentHealth() {
    if (cached && cached.cacheExpiresAt.getTime() > now()) return cached;
    if (inFlight) return inFlight;

    inFlight = load();
    try {
      cached = await inFlight;
      return cached;
    } finally {
      inFlight = undefined;
    }
  };
}

type ProbeOutcome =
  | { kind: "success"; latencyMs: number }
  | { kind: "timeout"; latencyMs: number }
  | { kind: "error"; latencyMs: number; error: unknown };

class PlatformHealthProbeTimeout extends Error {
  constructor() {
    super("Platform health probe timed out.");
    this.name = "PlatformHealthProbeTimeout";
  }
}

export function normalizePlatformReleaseId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function boundedLatency(startedAt: number, maximum: number) {
  return Math.min(
    maximum,
    Math.max(0, Math.round(performance.now() - startedAt)),
  );
}

async function runBoundedProbe(
  probe: PlatformHealthProbe,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new PlatformHealthProbeTimeout()),
          timeoutMs,
        );
      }),
    ]);
    return {
      kind: "success",
      latencyMs: boundedLatency(startedAt, timeoutMs),
    };
  } catch (error) {
    if (error instanceof PlatformHealthProbeTimeout) {
      controller.abort();
      return { kind: "timeout", latencyMs: timeoutMs };
    }
    return {
      kind: "error",
      latencyMs: boundedLatency(startedAt, timeoutMs),
      error,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isOracleAccessDenied(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.$metadata?.httpStatusCode === 401 ||
    candidate.$metadata?.httpStatusCode === 403 ||
    [
      "AccessDenied",
      "Forbidden",
      "InvalidAccessKeyId",
      "SignatureDoesNotMatch",
    ].includes(String(candidate.name ?? ""))
  );
}

function postgresResult(
  outcome: ProbeOutcome,
  checkedAt: Date,
): PlatformHealthDependency {
  if (outcome.kind === "success") {
    return {
      state: "HEALTHY",
      latencyMs: outcome.latencyMs,
      checkedAt,
      errorCode: null,
    };
  }
  return {
    state: "UNAVAILABLE",
    latencyMs: outcome.latencyMs,
    checkedAt,
    errorCode:
      outcome.kind === "timeout" ? "POSTGRES_TIMEOUT" : "POSTGRES_UNAVAILABLE",
  };
}

function oracleResult(
  outcome: ProbeOutcome,
  checkedAt: Date,
): PlatformHealthDependency {
  if (outcome.kind === "success") {
    return {
      state: "HEALTHY",
      latencyMs: outcome.latencyMs,
      checkedAt,
      errorCode: null,
    };
  }
  if (outcome.kind === "timeout") {
    return {
      state: "UNAVAILABLE",
      latencyMs: outcome.latencyMs,
      checkedAt,
      errorCode: "ORACLE_TIMEOUT",
    };
  }
  const accessDenied = isOracleAccessDenied(outcome.error);
  return {
    state: accessDenied ? "DEGRADED" : "UNAVAILABLE",
    latencyMs: outcome.latencyMs,
    checkedAt,
    errorCode: accessDenied ? "ORACLE_ACCESS_DENIED" : "ORACLE_UNAVAILABLE",
  };
}

export async function collectPlatformCurrentHealth(input: {
  probes: PlatformHealthProbeSet;
  releaseId?: unknown;
  checkedAt?: Date;
  timeoutMs?: number;
}): Promise<PlatformCurrentHealth> {
  const checkedAt = input.checkedAt ?? new Date();
  const timeoutMs =
    Number.isSafeInteger(input.timeoutMs) &&
    Number(input.timeoutMs) > 0 &&
    Number(input.timeoutMs) <= PLATFORM_HEALTH_PROBE_TIMEOUT_MS
      ? Number(input.timeoutMs)
      : PLATFORM_HEALTH_PROBE_TIMEOUT_MS;
  const releaseId = normalizePlatformReleaseId(input.releaseId);
  const [database, oracle] = await Promise.all([
    runBoundedProbe(input.probes.database, timeoutMs),
    input.probes.oracle
      ? runBoundedProbe(input.probes.oracle, timeoutMs)
      : Promise.resolve(null),
  ]);
  const application = {
    state: releaseId ? "HEALTHY" : "DEGRADED",
    latencyMs: 0,
    checkedAt,
    errorCode: releaseId ? null : "RELEASE_ID_UNAVAILABLE",
  } satisfies PlatformHealthDependency;
  const cacheExpiresAt = new Date(
    checkedAt.getTime() + PLATFORM_HEALTH_CACHE_TTL_MS,
  );

  return {
    checkedAt,
    cacheExpiresAt,
    releaseId,
    application,
    postgresql: postgresResult(database, checkedAt),
    oracle: oracle
      ? oracleResult(oracle, checkedAt)
      : {
          state: "UNKNOWN",
          latencyMs: null,
          checkedAt,
          errorCode: "ORACLE_NOT_CONFIGURED",
        },
  };
}
