import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils.ts";

test("cn combina classes e ignora falsy", () => {
  assert.equal(cn("a", false && "b", "c"), "a c");
});

test("cn resolve conflito do Tailwind (última vence)", () => {
  assert.equal(cn("p-2", "p-4"), "p-4");
});
