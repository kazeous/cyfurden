import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicOrderAction,
  type PublicOrderState,
} from "../app/s/[slug]/actions";

const initialState: PublicOrderState = { status: "idle", message: "" };

function orderForm(lines: string, locale = "en"): FormData {
  const form = new FormData();
  form.set("boothId", "booth-1");
  form.set("slug", "artist-booth");
  form.set("idempotencyKey", "10000000-0000-4000-8000-000000000000");
  form.set("customerName", "Test Customer");
  form.set("customerEmail", "customer@example.com");
  form.set("customerNote", "");
  form.set("locale", locale);
  form.set("lines", lines);
  return form;
}

test("malformed bag JSON receives a distinct recovery message", async () => {
  const result = await createPublicOrderAction(initialState, orderForm("{"));

  assert.deepEqual(result, {
    status: "error",
    message:
      "The bag data could not be read. Refresh the storefront and add the items again.",
  });
});

test("malformed Vietnamese bag feedback follows the storefront locale", async () => {
  const result = await createPublicOrderAction(
    initialState,
    orderForm("{", "vi"),
  );

  assert.deepEqual(result, {
    status: "error",
    message:
      "Không đọc được dữ liệu trong giỏ. Hãy tải lại storefront và thêm lại sản phẩm.",
  });
});

test("valid JSON with invalid bag contents keeps the validation message", async () => {
  const result = await createPublicOrderAction(initialState, orderForm("[]"));

  assert.deepEqual(result, {
    status: "error",
    message:
      "Check your contact details and bag quantities, then send the reservation again.",
  });
});
