"use server";

import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integrations";
import { supabaseServer } from "@/lib/supabase/server";

type Provider = "stripe" | "quickbooks";
const fail = (message: string): never => redirect(`/dashboard/integrations?error=${encodeURIComponent(message)}`);
const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();

function stripePlatform() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY must be configured to connect Stripe accounts.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function workspace() {
  const sb = await supabaseServer();
  if (!sb) return fail("Supabase is not configured. Add your project URL and anon key to the environment.");
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return fail("Please sign in again to manage integrations.");
  const { data: membership, error } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (error || !membership) return fail("Could not find your agency workspace.");
  return { sb, orgId: membership.org_id };
}

export async function saveIntegration(form: FormData) {
  const provider = text(form.get("provider")) as Provider;
  if (provider !== "stripe" && provider !== "quickbooks") return fail("Unsupported integration.");
  let value: Record<string, string>;
  if (provider === "stripe") {
    const apiKey = text(form.get("stripe_key"));
    if (!apiKey.startsWith("sk_") && !apiKey.startsWith("rk_")) return fail("Enter a Stripe secret or restricted key beginning with sk_ or rk_.");
    value = { apiKey };
  } else {
    const accessToken = text(form.get("qb_access_token"));
    const realmId = text(form.get("qb_realm_id"));
    if (!accessToken || !realmId) return fail("QuickBooks needs both an OAuth access token and company ID (realm ID).");
    value = { accessToken, realmId };
  }
  const { sb, orgId } = await workspace();
  const { data: existing, error: existingError } = await sb.from("integrations").select("account_id").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (existingError) return fail(`Could not load existing integration settings: ${existingError.message}`);
  let encryptedSecret: string;
  try {
    encryptedSecret = encryptIntegrationSecret(JSON.stringify(value));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Integration encryption is not configured.");
  }
  const { error } = await sb.from("integrations").upsert({
    org_id: orgId,
    provider,
    secret: encryptedSecret,
    account_id: existing?.account_id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,provider" });
  if (error) return fail(`Could not save integration: ${error.message}`);
  revalidatePath("/dashboard/integrations");
  redirect(`/dashboard/integrations?saved=${provider}`);
}

export async function startStripeConnect() {
  const { sb, orgId } = await workspace();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return fail("NEXT_PUBLIC_APP_URL must be configured before connecting Stripe.");

  let stripe: Stripe;
  try {
    stripe = stripePlatform();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Stripe is not configured.");
  }
  let { data: integration, error } = await sb.from("integrations").select("account_id")
    .eq("org_id", orgId).eq("provider", "stripe").maybeSingle();
  if (error) return fail(`Could not load Stripe connection: ${error.message}`);
  if (!integration) {
    const { error: createError } = await sb.from("integrations").insert({
      org_id: orgId, provider: "stripe", secret: null,
    });
    if (createError) return fail(`Could not initialize Stripe connection: ${createError.message}`);
    const result = await sb.from("integrations").select("account_id").eq("org_id", orgId).eq("provider", "stripe").single();
    integration = result.data;
    error = result.error;
    if (error || !integration) return fail(`Could not load Stripe connection: ${error?.message ?? "No integration record."}`);
  }

  let onboardingUrl: string;
  try {
    let accountId = integration.account_id;
    if (!accountId) {
      const { data: { user } } = await sb.auth.getUser();
      const account = await stripe.accounts.create({
        type: "express",
        ...(user?.email ? { email: user.email } : {}),
        metadata: { org_id: orgId },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      }, { idempotencyKey: `settle-connect-${orgId}` });
      accountId = account.id;
      const { error: updateError } = await sb.from("integrations").update({ account_id: accountId })
        .eq("org_id", orgId).eq("provider", "stripe");
      if (updateError) throw new Error(`Stripe account was created but could not be linked to this workspace: ${updateError.message}`);
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/dashboard/integrations?connect=refresh`,
      return_url: `${appUrl}/dashboard/integrations?connect=return`,
      type: "account_onboarding",
    });
    onboardingUrl = link.url;
  } catch (error) {
    return fail(`Could not start Stripe onboarding: ${error instanceof Error ? error.message : "Unknown Stripe error."}`);
  }
  redirect(onboardingUrl);
}

type ImportedInvoice = {
  external_id: string;
  client_name: string;
  client_email: string | null;
  amount_cents: number;
  currency: string;
  due_date: string;
  status?: "open" | "paid";
  source_provider: Provider;
  paid_at?: string | null;
};

async function syncStripe(apiKey: string): Promise<ImportedInvoice[]> {
  const stripe = new Stripe(apiKey);
  const results: ImportedInvoice[] = [];
  for (const status of ["open", "paid"] as const) {
    for await (const invoice of stripe.invoices.list({ limit: 100, status })) {
      if (!invoice.due_date) continue;
      const customer = invoice.customer;
      const customerData = typeof customer === "object" && customer && !customer.deleted ? customer : null;
      const name = invoice.customer_name || customerData?.name || null;
      results.push({
        external_id: invoice.id,
        source_provider: "stripe",
        client_name: name || invoice.customer_email || "Stripe customer",
        client_email: invoice.customer_email || customerData?.email || null,
        amount_cents: invoice.status === "open" ? invoice.amount_remaining : invoice.total,
        currency: invoice.currency,
        due_date: day(invoice.due_date),
        status: invoice.status === "paid" ? "paid" : "open",
        paid_at: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
      });
    }
  }
  return results;
}

type QuickBooksInvoice = {
  Id: string;
  DueDate?: string;
  Balance: number;
  TotalAmt: number;
  TxnStatus?: string;
  CurrencyRef?: { value?: string };
  CustomerRef?: { name?: string };
  BillEmail?: { Address?: string };
};

async function syncQuickBooks(accessToken: string, realmId: string): Promise<ImportedInvoice[]> {
  const results: ImportedInvoice[] = [];
  for (let startPosition = 1; ; startPosition += 100) {
    const query = encodeURIComponent(`select * from Invoice startposition ${startPosition} maxresults 100`);
    const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(realmId)}/query?query=${query}&minorversion=75`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`QuickBooks returned HTTP ${response.status}. Check the access token and company ID.`);
    const result = await response.json() as { QueryResponse?: { Invoice?: QuickBooksInvoice[] } };
    const invoices = result.QueryResponse?.Invoice ?? [];
    results.push(...invoices.filter((invoice) => invoice.Id && invoice.DueDate && invoice.TxnStatus?.toLowerCase() !== "voided").map((invoice) => ({
      external_id: invoice.Id,
      source_provider: "quickbooks" as const,
      client_name: invoice.CustomerRef?.name || "QuickBooks customer",
      client_email: invoice.BillEmail?.Address || null,
      amount_cents: Math.round((invoice.Balance > 0 ? invoice.Balance : invoice.TotalAmt) * 100),
      currency: (invoice.CurrencyRef?.value || "USD").toLowerCase(),
      due_date: invoice.DueDate!,
      status: invoice.Balance > 0 ? "open" as const : "paid" as const,
    })));
    if (invoices.length < 100) break;
  }
  return results;
}

export async function syncIntegration(form: FormData) {
  const provider = text(form.get("provider")) as Provider;
  if (provider !== "stripe" && provider !== "quickbooks") return fail("Unsupported integration.");
  const { sb, orgId } = await workspace();
  const { data: integration, error: lookupError } = await sb.from("integrations").select("secret").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (lookupError) return fail(`Could not load integration: ${lookupError.message}`);
  if (!integration) return fail("Save integration credentials before syncing.");

  let imported: ImportedInvoice[];
  try {
    const credentials = JSON.parse(decryptIntegrationSecret(integration.secret)) as Record<string, string>;
    imported = provider === "stripe"
      ? await syncStripe(credentials.apiKey || "")
      : await syncQuickBooks(credentials.accessToken || "", credentials.realmId || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown provider error occurred.";
    const { error: logError } = await sb.from("integration_syncs").insert({ org_id: orgId, provider, status: "failed", imported_count: 0, error: message.slice(0, 500) });
    if (logError) return fail(`Sync failed: ${message}. The failure could not be recorded: ${logError.message}`);
    return fail(`Sync failed: ${message}`);
  }
  for (let offset = 0; offset < imported.length; offset += 100) {
    const batch = imported.slice(offset, offset + 100).map((invoice) => ({
      ...invoice,
      status: invoice.status ?? "open",
      paid_at: invoice.paid_at ?? null,
      org_id: orgId,
    }));
    const { error } = await sb.from("invoices").upsert(batch, { onConflict: "org_id,source_provider,external_id" });
    if (error) {
      const message = `Invoice import failed after ${offset} records: ${error.message}`;
      const { error: logError } = await sb.from("integration_syncs").insert({
        org_id: orgId, provider, status: "failed", imported_count: offset, error: message.slice(0, 500),
      });
      if (logError) return fail(`${message}. The failure could not be recorded: ${logError.message}`);
      return fail(message);
    }
  }
  const { error: logError } = await sb.from("integration_syncs").insert({
    org_id: orgId, provider, status: "success", imported_count: imported.length,
  });
  if (logError) return fail(`Invoices synced, but the sync result could not be recorded: ${logError.message}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/integrations");
  redirect(`/dashboard/integrations?synced=${imported.length}`);
}
