import test from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, isEligibleInvoice, selectNextStep } from "../supabase/functions/daily-dunning/policy.mjs";

test("only open, unpaused invoices due today or earlier are eligible", () => {
  const today = "2026-10-18";
  assert.equal(isEligibleInvoice({ status: "open", paused: false, due_date: "2026-10-17" }, today), true);
  assert.equal(isEligibleInvoice({ status: "paid", paused: false, due_date: "2026-10-01" }, today), false);
  assert.equal(isEligibleInvoice({ status: "open", paused: true, due_date: today }, today), false);
  assert.equal(isEligibleInvoice({ status: "open", paused: false, due_date: "2026-10-19" }, today), false);
});

test("selects the first due step after the invoice current position", () => {
  const steps = [{ position: 3, day_offset: 10 }, { position: 1, day_offset: 1 }, { position: 2, day_offset: 5 }];
  assert.deepEqual(selectNextStep(steps, 0, 7), { position: 1, day_offset: 1 });
  assert.deepEqual(selectNextStep(steps, 1, 7), { position: 2, day_offset: 5 });
  assert.equal(selectNextStep(steps, 2, 7), null);
});

test("fills known reminder placeholders and clears unknown values", () => {
  assert.equal(fillTemplate("Hi {{client}}, pay {{amount}} {{unknown}}", { client: "Sam", amount: "$50" }), "Hi Sam, pay $50 ");
});
