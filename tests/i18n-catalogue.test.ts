import assert from "node:assert/strict";
import test from "node:test";
import { translate } from "@/lib/i18n";

test("Vietnamese catalogue covers landing, auth, cart, and reservation feedback", () => {
  const landing = translate("vi", "publicLanding");
  const auth = translate("vi", "publicAuth");
  const booth = translate("vi", "publicBooth");
  const reservation = translate("vi", "publicReservation");

  assert.equal(landing.languageToggleLabel, "Ngôn ngữ");
  assert.equal(auth.formHeading.signUp, "Dựng tài khoản Cyfurden của bạn");
  assert.match(booth.cartActionSaveFailed, /Chưa lưu được đặt trước/);
  assert.match(reservation.referenceSaved, /Đã gửi mã tham chiếu/);
});

test("English remains the catalogue default", () => {
  assert.equal(
    translate(undefined, "publicBooth").cartTitleEmpty,
    "Your bag is empty",
  );
  assert.equal(
    translate("not-a-locale", "publicReservation").paymentHeading,
    "Manual bank transfer",
  );
});
