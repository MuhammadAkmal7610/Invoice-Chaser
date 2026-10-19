// Deno edge function: finds overdue, unpaused invoices and sends the next due step.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fillTemplate, isEligibleInvoice, selectNextStep } from "./policy.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const db = createClient(supabaseUrl, serviceKey);
const APP = Deno.env.get("APP_URL");

async function sendEmail(to: string, subject: string, body: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
}

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  if (!sid || !token || !from) throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM must be configured.");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}.`);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!APP) return new Response("APP_URL is not configured.", { status: 500 });
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices, error: invoicesError } = await db.from("invoices").select("*")
    .eq("status", "open").eq("paused", false).lte("due_date", today);
  if (invoicesError) return new Response(`Could not load invoices: ${invoicesError.message}`, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const invoice of invoices ?? []) {
    if (!isEligibleInvoice(invoice, today)) continue;
    const dueAt = new Date(`${invoice.due_date}T00:00:00Z`).getTime();
    const daysLate = Math.max(0, Math.floor((Date.now() - dueAt) / 86400000));
    const { data: sequence, error: sequenceError } = await db.from("sequences").select("id")
      .eq("org_id", invoice.org_id).eq("is_default", true).maybeSingle();
    if (sequenceError) return new Response(`Could not load workflow: ${sequenceError.message}`, { status: 500 });
    if (!sequence) continue;
    const { data: steps, error: stepError } = await db.from("sequence_steps").select("*")
      .eq("sequence_id", sequence.id);
    if (stepError) return new Response(`Could not load workflow step: ${stepError.message}`, { status: 500 });
    const step = selectNextStep(steps ?? [], invoice.current_step, daysLate);
    if (!step) continue;

    const variables = {
      client: invoice.client_name,
      amount: new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(invoice.amount_cents / 100),
      pay_link: `${APP}/pay/${invoice.pay_token}`,
    };
    const body = fill(step.body, variables);
    let status: "sent" | "failed" = "failed";
    let deliveryError: string | null = null;
    try {
      if (step.channel === "sms") {
        if (!invoice.client_phone) throw new Error("Invoice has no client phone number for SMS.");
        await sendSms(invoice.client_phone, body);
      } else {
        if (!invoice.client_email) throw new Error("Invoice has no client email address.");
        await sendEmail(invoice.client_email, fill(step.subject ?? "Invoice reminder", variables), body);
      }
      status = "sent";
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "Unknown delivery error.";
      failed++;
    }

    const { error: logError } = await db.from("reminder_log").insert({
      invoice_id: invoice.id, step_id: step.id, channel: step.channel, status,
    });
    if (logError) return new Response(`Could not record reminder delivery: ${logError.message}`, { status: 500 });
    if (status === "sent") {
      const { error: updateError } = await db.from("invoices").update({ current_step: step.position }).eq("id", invoice.id);
      if (updateError) return new Response(`Reminder sent but invoice progress could not be updated: ${updateError.message}`, { status: 500 });
      sent++;
    } else if (deliveryError) {
      console.error(`Reminder failed for invoice ${invoice.id}: ${deliveryError}`);
    }
  }
  return Response.json({ checked: invoices?.length ?? 0, sent, failed });
});
