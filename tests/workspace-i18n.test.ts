import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localizeGachaCompilationError } from "../lib/i18n/gacha-errors";
import { parseBilingual } from "../lib/i18n/parser";
import { getWorkspaceStrings } from "../lib/i18n/workspace";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";
import { defaultPaymentContent } from "../lib/system-content";

function catalogueShape(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return value.map(catalogueShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, catalogueShape(nested)]),
    );
  }
  return typeof value;
}

test("private-workspace English and Vietnamese catalogues have identical shapes", () => {
  assert.deepEqual(
    catalogueShape(getWorkspaceStrings("vi")),
    catalogueShape(getWorkspaceStrings("en")),
  );
});

test("private-workspace labels and action feedback resolve in Vietnamese", () => {
  const strings = getWorkspaceStrings("vi");

  assert.equal(strings.dashboard.title, "Booth của bạn");
  assert.equal(strings.settings.boothInfo, "Thông tin booth");
  assert.equal(strings.orders.title, "Đơn hàng");
  assert.match(strings.actions.productSaveFailed, /Không thể lưu sản phẩm/);
  assert.match(strings.actions.invitationExpired, /đã hết hạn/);
  assert.match(strings.actions.orderChanged("CYF-1", "Đã xác nhận"), /CYF-1/);
});

test("gacha compilation feedback uses the active workspace language", () => {
  const strings = getWorkspaceStrings("vi").gacha;

  assert.equal(
    localizeGachaCompilationError(
      "Save the game setup before publishing.",
      strings,
    ),
    strings.compileSetup,
  );
  assert.equal(
    localizeGachaCompilationError(
      "[en]Summer shelf[/en][vi]Kệ mùa hè[/vi] must end after it starts.",
      strings,
      (value) => parseBilingual(value, "vi"),
    ),
    strings.compileDateOrder("Kệ mùa hè"),
  );
});

test("system-authored booth defaults render in both storefront languages", () => {
  const document = createDefaultStorefrontDocument("Paper Comet");

  assert.equal(
    parseBilingual(defaultPaymentContent.label, "vi"),
    "Chuyển khoản ngân hàng",
  );
  assert.match(parseBilingual(document.tagline, "en"), /Small wonders/);
  assert.match(parseBilingual(document.tagline, "vi"), /điều kỳ diệu/);
});

test("all private-workspace entry pages resolve the locale catalogue", async () => {
  const paths = [
    "app/dashboard/page.tsx",
    "app/dashboard/new/page.tsx",
    "app/invitations/[token]/page.tsx",
    "app/manage/[boothId]/gacha/page.tsx",
    "app/manage/[boothId]/orders/page.tsx",
    "app/manage/[boothId]/orders/[orderId]/page.tsx",
    "app/manage/[boothId]/payments/page.tsx",
    "app/manage/[boothId]/products/page.tsx",
    "app/manage/[boothId]/settings/page.tsx",
    "app/manage/[boothId]/storefront/page.tsx",
    "app/manage/[boothId]/shipping/page.tsx",
    "app/manage/[boothId]/team/page.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(
      new URL(`../${path}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /readLocaleCookie/);
    assert.match(source, /getWorkspaceStrings/);
  }

  const actions = await readFile(
    new URL("../app/manage/[boothId]/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(actions, /readActionStrings/);
  assert.match(actions, /strings\.productSaveFailed/);
  assert.match(actions, /strings\.invitationAcceptFailed/);
});
