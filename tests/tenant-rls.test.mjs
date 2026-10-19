import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("tenant migration keeps RLS enabled and membership-scoped policies", async () => {
  const sql = await readFile(new URL("../supabase/migrations/001_init.sql", import.meta.url), "utf8");
  for (const table of ["organizations", "memberships", "integrations", "sequences", "sequence_steps", "invoices", "reminder_log"]) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security`, "i"), `${table} should enable RLS`);
  }
  assert.match(sql, /create or replace function is_member\(o uuid\).*?user_id = auth\.uid\(\)/is);
  assert.match(sql, /create policy inv_all on invoices for all using \(is_member\(org_id\)\) with check \(is_member\(org_id\)\)/i);
  assert.match(sql, /create policy int_all on integrations for all using \(is_member\(org_id\)\) with check \(is_member\(org_id\)\)/i);
});
