import assert from "node:assert/strict";
import test from "node:test";
import {
  submitCustomerTransferReferenceAction,
  type CustomerTransferReferenceState,
} from "@/app/s/[slug]/reservation/[code]/actions";

const initialState: CustomerTransferReferenceState = {
  status: "idle",
  message: "",
};

test("invalid transfer-reference feedback follows the public locale", async () => {
  const form = new FormData();
  form.set("slug", "artist-booth");
  form.set("code", "CYF-0123456789ABCDEF");
  form.set("customerTransferReference", "");
  form.set("locale", "vi");

  const result = await submitCustomerTransferReferenceAction(
    initialState,
    form,
  );

  assert.deepEqual(result, {
    status: "error",
    message: "Nhập mã tham chiếu hiển thị trên biên nhận ngân hàng.",
  });
});
