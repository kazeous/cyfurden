import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps Sentry scoped to privacy-conscious error monitoring", async () => {
  const [
    instrumentation,
    clientConfig,
    serverConfig,
    edgeConfig,
    nextConfig,
    globalError,
    productActions,
    productForm,
    smokeScript,
    envExample,
  ] = await Promise.all([
    readFile(new URL("../instrumentation.ts", import.meta.url), "utf8"),
    readFile(new URL("../instrumentation-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../sentry.server.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../sentry.edge.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/global-error.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/manage/[boothId]/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/manage/[boothId]/products/product-form.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../scripts/test-sentry.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(instrumentation, /Sentry\.captureRequestError/);
  assert.match(instrumentation, /sentry\.server\.config/);
  assert.match(instrumentation, /sentry\.edge\.config/);
  assert.match(clientConfig, /Sentry\.captureRouterTransitionStart/);

  for (const config of [clientConfig, serverConfig, edgeConfig]) {
    assert.match(config, /enabled:\s*Boolean\(dsn\)/);
    assert.match(config, /sampleRate:\s*1/);
    assert.match(config, /tracesSampleRate:\s*0/);
    assert.match(config, /enableLogs:\s*false/);
    assert.match(config, /sendDefaultPii:\s*false/);
    assert.doesNotMatch(config, /replayIntegration|replaysSessionSampleRate/);
  }

  assert.match(nextConfig, /withSentryConfig/);
  assert.match(nextConfig, /disable:\s*!hasSentrySourceMapCredentials/);
  assert.match(nextConfig, /deleteSourcemapsAfterUpload:\s*true/);
  assert.match(globalError, /Sentry\.captureException\(error\)/);
  assert.match(globalError, /onClick=\{reset\}/);
  assert.match(productActions, /Sentry\.withServerActionInstrumentation\(/);
  assert.match(productActions, /recordResponse:\s*false/);
  assert.match(productActions, /Sentry\.captureException\(error/);
  assert.doesNotMatch(productActions, /formData:\s*formData/);
  assert.match(productForm, /saveProductWithClientFallback/);
  assert.match(productForm, /server_action_transport/);
  assert.match(productForm, /Sentry\.captureException\(error/);
  assert.match(smokeScript, /Cyfurden Sentry integration test/);
  assert.match(smokeScript, /sendDefaultPii:\s*false/);
  assert.match(smokeScript, /Sentry\.flush\(5_000\)/);

  assert.match(envExample, /NEXT_PUBLIC_SENTRY_DSN=/);
  assert.match(envExample, /SENTRY_ORG=/);
  assert.match(envExample, /SENTRY_PROJECT=/);
  assert.match(envExample, /SENTRY_AUTH_TOKEN=/);
});
