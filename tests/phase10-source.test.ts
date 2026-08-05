import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10 persists booth-scoped events and order attribution", async () => {
  const [schema, migration, publicAction] = await Promise.all([
    readSource("prisma/schema.prisma"),
    readSource("prisma/migrations/0010_phase10_order_events/migration.sql"),
    readSource("app/s/[slug]/actions.ts"),
  ]);

  assert.match(schema, /model Event \{/);
  assert.match(schema, /@@unique\(\[id, boothId\]\)/);
  assert.match(
    schema,
    /@relation\(fields: \[eventId, boothId\], references: \[id, boothId\]/,
  );
  assert.match(migration, /Event_date_range_check/);
  assert.match(migration, /Order_eventId_boothId_fkey/);
  assert.match(publicAction, /transaction\.event\.findFirst/);
  assert.match(publicAction, /startsAt: \{ lte: placedAt \}/);
  assert.match(publicAction, /endsAt: \{ gt: placedAt \}/);
  assert.match(publicAction, /eventId: currentEvent\?\.id/);
  assert.match(publicAction, /placedAt,/);
  assert.match(publicAction, /isolationLevel: "Serializable"/);
});

test("Phase 10 event writes are role-checked, scoped, serialized, and audited", async () => {
  const actions = await readSource("app/manage/[boothId]/actions.ts");

  assert.match(actions, /saveOrderEventAction/);
  assert.match(actions, /requireBoothRole\(boothId, editorRoles\)/);
  assert.match(actions, /where: \{ id: eventId, boothId \}/);
  assert.match(actions, /startsAt: \{ lt: range\.endsAt \}/);
  assert.match(actions, /endsAt: \{ gt: range\.startsAt \}/);
  assert.match(actions, /isolationLevel: "Serializable"/);
  assert.match(
    actions,
    /action: eventId \? "order_event\.updated" : "order_event\.created"/,
  );
});

test("Phase 10 exposes Event mode, All events filtering, and visible polling", async () => {
  const [page, refresh] = await Promise.all([
    readSource("app/manage/[boothId]/orders/page.tsx"),
    readSource("app/manage/[boothId]/orders/live-refresh.tsx"),
  ]);

  assert.match(page, /strings\.events/);
  assert.match(page, /strings\.allEvents/);
  assert.match(page, /orderEventWhere\(selectedMode, selectedEvent\)/);
  assert.match(page, /<EventEditor/);
  assert.match(page, /<OrdersLiveRefresh/);
  assert.match(refresh, /router\.refresh\(\)/);
  assert.match(refresh, /window\.setInterval/);
  assert.match(refresh, /visibilitychange/);
  assert.match(refresh, /strings\.liveOn/);
});
