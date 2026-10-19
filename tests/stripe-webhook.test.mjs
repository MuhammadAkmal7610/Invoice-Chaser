import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Stripe webhook validates signatures before processing and ignores unpaid sessions", async () => {
  const source = await readFile(new URL("../src/app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  assert.match(source, /constructEvent\(body, signature, webhookSecret\)/);
  assert.match(source, /Invalid signature.*?status:\s*400/s);
  assert.match(source, /session\.payment_status === "paid"/);
  assert.match(source, /\.eq\("status", "open"\)/);
  assert.match(source, /connectedAccount/);
});
