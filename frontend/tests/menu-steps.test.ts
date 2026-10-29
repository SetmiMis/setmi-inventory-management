import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU_STEPS, parseStep, showAtStep, stepOf } from "../src/lib/menu-steps.ts";

test("step 1 shows the daily stock pages and hides the rest", () => {
  for (const href of ["/dashboard", "/items", "/items/categories", "/stock", "/stock/entry", "/locations", "/reorder", "/admin/settings"]) {
    assert.equal(showAtStep(href, 1), true, href);
  }
  for (const href of ["/suppliers", "/receipts", "/transfers", "/purchase-orders", "/sales-orders", "/reports/inventory"]) {
    assert.equal(showAtStep(href, 1), false, href);
  }
});

test("each step adds pages and never removes one", () => {
  const pages = ["/items", "/suppliers", "/receipts", "/transfers", "/stock/count", "/purchase-orders", "/dispatch"];
  for (const href of pages) {
    let seen = false;
    for (const { step } of MENU_STEPS) {
      const shown = showAtStep(href, step);
      assert.ok(!seen || shown, `${href} disappears at step ${step}`);
      seen = seen || shown;
    }
  }
  assert.equal(showAtStep("/suppliers", 2), true);
  assert.equal(showAtStep("/transfers", 2), false);
  assert.equal(showAtStep("/transfers", 3), true);
});

test("step 4 shows everything, also a page that has no step yet", () => {
  assert.equal(showAtStep("/a-page-added-later", 4), true);
  assert.equal(stepOf("/a-page-added-later"), 4);
  assert.equal(showAtStep("/a-page-added-later", 3), false);
});

test("a query string does not change the step of a page", () => {
  assert.equal(stepOf("/stock/entry?x=1"), 1);
});

test("a bad value from the database means everything is shown", () => {
  for (const bad of [null, undefined, 0, 5, "2", 1.5, NaN, {}]) assert.equal(parseStep(bad), 4);
  assert.equal(parseStep(1), 1);
  assert.equal(parseStep(3), 3);
});
