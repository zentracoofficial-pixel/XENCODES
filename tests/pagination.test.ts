import test from "node:test";
import assert from "node:assert/strict";
import { pageMath, pageWindow, parsePage } from "../src/lib/pagination";

test("a page number from a query string is a whole number of at least 1", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-4"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("2.9"), 2);
  assert.equal(parsePage(["5", "6"]), 5);
  assert.equal(parsePage("999999999"), 100_000);
});

test("where a page sits, kept in range", () => {
  assert.deepEqual(pageMath(0, 1, 15), { page: 1, totalPages: 1, skip: 0, from: 0, to: 0 });
  assert.deepEqual(pageMath(40, 1, 15), { page: 1, totalPages: 3, skip: 0, from: 1, to: 15 });
  assert.deepEqual(pageMath(40, 3, 15), { page: 3, totalPages: 3, skip: 30, from: 31, to: 40 });
  // Asking for a page that no longer exists lands on the last one.
  assert.equal(pageMath(40, 99, 15).page, 3);
  assert.equal(pageMath(15, 1, 15).totalPages, 1);
});

test("the page links show the ends and the neighbours, with gaps marked", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, null, 10]);
  assert.deepEqual(pageWindow(5, 10), [1, null, 4, 5, 6, null, 10]);
  assert.deepEqual(pageWindow(10, 10), [1, null, 9, 10]);
});
