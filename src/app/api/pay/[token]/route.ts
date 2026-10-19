import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Payment processing is not configured." }, { status: 503 });
  const { data: inv, error: invoiceError } = await supabase.from("invoices")
    .select("id, org_id, client_name, client_email, amount_cents, currency, pay_token")
    .eq("pay_token", token).eq("status", "open").maybeSingle();
  if (invoiceError) return NextResponse.json({ error: `Could not load invoice: ${invoiceError.message}` }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Invoice not found or already paid" }, { status: 404 });
  const secret = process.env.STRIPE_SECRET_KEY;
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (!secret || !app) return NextResponse.json({ error: "Payment processing is not configured." }, { status: 503 });

  try {
    const stripe = new Stripe(secret);
    const { data: integration, error: integrationError } = await supabase.from("integrations")
      .select("account_id").eq("org_id", inv.org_id).eq("provider", "stripe").maybeSingle();
    if (integrationError) throw new Error(`Could not load payment account: ${integrationError.message}`);
    let options: Stripe.RequestOptions | undefined;
    if (integration?.account_id) {
      const account = await stripe.accounts.retrieve(integration.account_id);
      if (!account.charges_enabled) {
        return NextResponse.json({ error: "The agency's Stripe account is not ready to accept payments." }, { status: 409 });
      }
      options = { stripeAccount: integration.account_id };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: inv.currency,
          unit_amount: inv.amount_cents,
          product_data: { name: `Invoice for ${inv.client_name}` },
        },
      }],
      ...(inv.client_email ? { customer_email: inv.client_email } : {}),
      metadata: { invoice_id: inv.id },
      success_url: `${app}/pay/${token}?checkout=success`,
      cancel_url: `${app}/pay/${token}`,
    }, options);
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe checkout error.";
    console.error(`Could not create checkout for invoice ${inv.id}: ${message}`);
    return NextResponse.json({ error: "Could not start secure checkout. Please try again later." }, { status: 502 });
  }
}
