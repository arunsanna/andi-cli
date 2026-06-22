"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapAlert, TABLE } = require("../src/wcag-map.cjs");

test("mapAlert returns no-accessible-name for button with no accessible name", () => {
  const result = mapAlert("Button has no accessible name, innerText, or title.");
  assert.deepEqual(result, { ruleId: "no-accessible-name", wcag: ["4.1.2"] });
});

test("mapAlert returns null for unknown/unmatched message", () => {
  const result = mapAlert("Some completely unknown alert message xyz");
  assert.equal(result, null);
});

test("mapAlert returns low-contrast for contrast message", () => {
  const result = mapAlert("Element has insufficient contrast ratio.");
  assert.deepEqual(result, { ruleId: "low-contrast", wcag: ["1.4.3"] });
});

test("mapAlert returns image-no-name for image with no alt", () => {
  const result = mapAlert("Image has no alt text.");
  assert.deepEqual(result, { ruleId: "image-no-name", wcag: ["1.1.1"] });
});

test("mapAlert returns null for empty string", () => {
  const result = mapAlert("");
  assert.equal(result, null);
});

test("mapAlert returns null for null input", () => {
  const result = mapAlert(null);
  assert.equal(result, null);
});

test("TABLE is exported and is an array", () => {
  assert.ok(Array.isArray(TABLE));
  assert.ok(TABLE.length > 0);
});

test("mapAlert returns iframe-no-title for iframe with no accessible name or title", () => {
  const result = mapAlert("Iframe has no accessible name or [title].");
  assert.deepEqual(result, { ruleId: "iframe-no-title", wcag: ["4.1.2", "2.4.1"] });
});

test("mapAlert returns no-accessible-name for generic element (button) with no accessible name", () => {
  const result = mapAlert("Button has no accessible name.");
  assert.deepEqual(result, { ruleId: "no-accessible-name", wcag: ["4.1.2"] });
});
