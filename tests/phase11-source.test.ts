import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 11 shell exposes booth switching, product counts, and overflow tools", async () => {
  const [layout, shell, nav, menu] = await Promise.all([
    readSource("app/manage/[boothId]/layout.tsx"),
    readSource("components/admin/admin-shell.tsx"),
    readSource("components/admin/admin-nav.tsx"),
    readSource("components/admin/admin-overflow-menu.tsx"),
  ]);

  assert.match(layout, /db\.boothMembership\.findMany/);
  assert.match(layout, /db\.product\.count/);
  assert.match(shell, /BoothSwitcher/);
  assert.match(shell, /aria-current=\{current \? "page"/);
  assert.match(shell, /\/dashboard\/new/);
  assert.match(nav, /className=\{styles\.navCount\}/);
  assert.match(menu, /setLocaleAction/);
  assert.match(menu, /\/settings/);
  assert.match(menu, /OrderAlertsControl/);
  assert.match(menu, /signOut\(\)/);
});

test("Phase 11 Settings reuses protected booth, storefront, and payment records", async () => {
  const [page, form, actions] = await Promise.all([
    readSource("app/manage/[boothId]/settings/page.tsx"),
    readSource("app/manage/[boothId]/settings/settings-form.tsx"),
    readSource("app/manage/[boothId]/actions.ts"),
  ]);

  assert.match(page, /requireBoothSection\(boothId, "settings"\)/);
  assert.match(form, /Booth info/);
  assert.match(form, /Payment &amp; QR/);
  assert.match(form, /BoothIdentityControls/);
  assert.match(form, /name="qrImage"/);
  assert.match(actions, /saveBoothSettingsAction/);
  assert.match(actions, /requireBoothRole\(boothId, editorRoles\)/);
  assert.match(actions, /transaction\.storefrontConfig\.upsert/);
  assert.match(actions, /transaction\.boothPaymentInstruction\.upsert/);
  assert.match(actions, /action: "booth\.settings_updated"/);
});

test("Phase 11 alerts remain opt-in and client-side only", async () => {
  const [control, client, refresh, schema] = await Promise.all([
    readSource("components/admin/order-alerts-control.tsx"),
    readSource("lib/order-alerts-client.ts"),
    readSource("app/manage/[boothId]/orders/live-refresh.tsx"),
    readSource("prisma/schema.prisma"),
  ]);

  assert.match(control, /requestBrowserNotificationPermission/);
  assert.match(client, /localStorage\.setItem/);
  assert.match(client, /new Notification/);
  assert.match(client, /createOscillator/);
  assert.match(refresh, /isNewPendingOrder/);
  assert.match(refresh, /playOrderAlertSound/);
  assert.match(refresh, /orderAlertToast/);
  assert.doesNotMatch(client, /fetch\(/);
  assert.doesNotMatch(client, /serviceWorker|PushManager|WebSocket/);
  assert.doesNotMatch(schema, /AlertSubscription|PushSubscription/);
});
