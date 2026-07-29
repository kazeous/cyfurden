import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBilingual } from "@/lib/i18n/parser";

test("parseBilingual returns plain text for any locale", () => {
  const value = "Just a regular phrase.";
  assert.equal(parseBilingual(value, "en"), value);
  assert.equal(parseBilingual(value, "vi"), value);
});

test("parseBilingual extracts the requested locale from inline tags", () => {
  const value = "[en]Red Mug[/en][vi]Cốc Đỏ[/vi]";
  assert.equal(parseBilingual(value, "en"), "Red Mug");
  assert.equal(parseBilingual(value, "vi"), "Cốc Đỏ");
});

test("parseBilingual ignores case differences in tag names", () => {
  const value = "[EN]Hello[/EN][VI]Xin chào[/VI]";
  assert.equal(parseBilingual(value, "en"), "Hello");
  assert.equal(parseBilingual(value, "vi"), "Xin chào");
});

test("parseBilingual falls back to plain text when only one tag is closed", () => {
  const value = "[en]Hello world";
  assert.equal(parseBilingual(value, "en"), "Hello world");
  assert.equal(parseBilingual(value, "vi"), "Hello world");
});

test("parseBilingual returns the other locale when only one tag pair exists", () => {
  const value = "[en]Only English[/en]";
  assert.equal(parseBilingual(value, "en"), "Only English");
  assert.equal(parseBilingual(value, "vi"), "[en]Only English[/en]");
});

test("parseBilingual accepts the tag pair in either order", () => {
  const value = "[vi]Chào[/vi][en]Hello[/en]";
  assert.equal(parseBilingual(value, "en"), "Hello");
  assert.equal(parseBilingual(value, "vi"), "Chào");
});

test("parseBilingual trims content inside tags", () => {
  const value = "[en]  Padded  [/en][vi]   Có khoảng trắng   [/vi]";
  assert.equal(parseBilingual(value, "en"), "Padded");
  assert.equal(parseBilingual(value, "vi"), "Có khoảng trắng");
});

test("parseBilingual treats null and undefined as empty string", () => {
  assert.equal(parseBilingual(null, "en"), "");
  assert.equal(parseBilingual(undefined, "vi"), "");
});

test("parseBilingual tolerates an unknown locale value", () => {
  const value = "[en]Hello[/en][vi]Xin chào[/vi]";
  assert.equal(parseBilingual(value, "fr"), "Hello");
});