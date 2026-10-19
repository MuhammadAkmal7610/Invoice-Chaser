"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

// RLS guarantees users can only touch their own org's invoices.
export async function setPaused(id: string, paused: boolean) {
  const sb = await supabaseServer();
  if (!sb) throw new Error("Supabase is not configured. Add your project URL and anon key to the environment.");
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) throw new Error("Please sign in again to change invoice automation.");
  const { data, error } = await sb.from("invoices").update({ paused }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error(`Could not update invoice automation: ${error?.message ?? "Invoice not found in your workspace."}`);
  revalidatePath("/dashboard");
}

export async function addInvoice(form: FormData) {
  const sb = await supabaseServer();
  if (!sb) throw new Error("Supabase is not configured. Add your project URL and anon key to the environment.");
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) throw new Error("Please sign in again to add an invoice.");
  const { data: m, error: membershipError } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).single();
  if (membershipError || !m) throw new Error(`Could not find your workspace: ${membershipError?.message ?? "No membership."}`);
  const client = String(form.get("client") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const amount = Number(form.get("amount"));
  const due = String(form.get("due") ?? "");
  if (!client || !email || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new Error("Enter a client, valid email, positive amount, and due date.");
  }
  const { error } = await sb.from("invoices").insert({
    org_id: m.org_id,
    client_name: client,
    client_email: email,
    amount_cents: Math.round(amount * 100),
    due_date: due,
  });
  if (error) throw new Error(`Could not add invoice: ${error.message}`);
  revalidatePath("/dashboard");
}
