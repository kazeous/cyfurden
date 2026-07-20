import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (!dsn) {
  console.error("NEXT_PUBLIC_SENTRY_DSN is required to send a test event.");
  process.exitCode = 1;
} else {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: 0,
    enableLogs: false,
    sendDefaultPii: false,
  });

  const eventId = Sentry.captureMessage(
    "Cyfurden Sentry integration test",
    "info",
  );
  const flushed = await Sentry.flush(5_000);

  if (!flushed) {
    console.error("Sentry did not confirm delivery within five seconds.");
    process.exitCode = 1;
  } else {
    console.log(`Sent Sentry test event ${eventId}.`);
  }
}
