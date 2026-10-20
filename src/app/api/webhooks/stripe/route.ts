import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

// Marking an invoice paid stops the nightly job from sending anything further.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !webhookSecret || !signature) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(secret).webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "subscription" && session.customer && typeof session.customer === "string" && typeof session.subscription === "string") {
      const subscription = await new Stripe(secret).subscriptions.retrieve(session.subscription);
      const priceId = subscription.items.data[0]?.price.id;
      const plans: Record<string, "starter" | "pro" | "agency"> = {
        [process.env.STRIPE_PRICE_STARTER || "__missing_starter__"]: "starter",
        [process.env.STRIPE_PRICE_PRO || "__missing_pro__"]: "pro",
        [process.env.STRIPE_PRICE_AGENCY || "__missing_agency__"]: "agency",
      };
      const plan = priceId ? plans[priceId] : undefined;
      if (!plan) return NextResponse.json({ received: true, ignored: true });
      const status = subscription.status === "active" || subscription.status === "trialing" ? "active" : subscription.status === "past_due" || subscription.status === "unpaid" ? "past_due" : "suspended";
      const { error } = await supabase.rpc("sync_workspace_subscription", {
        p_customer_id: session.customer, p_subscription_id: subscription.id, p_plan: plan,
        p_status: status, p_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      });
      if (error) {
        console.error(`Could not sync workspace subscription ${subscription.id}: ${error.message}`);
        return NextResponse.json({ error: "Could not record subscription." }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }
    const id = session.metadata?.invoice_id;
    if (id && session.payment_status === "paid") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ received: true, ignored: true });
      }
      const { data: invoice, error: invoiceError } = await supabase.from("invoices")
        .select("org_id").eq("id", id).eq("status", "open").maybeSingle();
      if (invoiceError) {
        console.error(`Could not load invoice ${id} for payment confirmation: ${invoiceError.message}`);
        return NextResponse.json({ error: "Could not verify invoice." }, { status: 500 });
      }
      if (!invoice) return NextResponse.json({ received: true, ignored: true });

      if (event.account) {
        const { data: connectedAccount, error: accountError } = await supabase.from("integrations")
          .select("id").eq("org_id", invoice.org_id).eq("provider", "stripe").eq("account_id", event.account).maybeSingle();
        if (accountError) {
          console.error(`Could not verify connected account for invoice ${id}: ${accountError.message}`);
          return NextResponse.json({ error: "Could not verify payment account." }, { status: 500 });
        }
        if (!connectedAccount) {
          console.warn(`Ignored payment event from an unlinked Stripe account for invoice ${id}.`);
          return NextResponse.json({ received: true, ignored: true });
        }
      }
      const { error } = await supabase.from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("org_id", invoice.org_id).eq("status", "open");
      if (error) {
        console.error(`Could not mark invoice ${id} paid: ${error.message}`);
        return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
      }
    }
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const priceId = subscription.items.data[0]?.price.id;
    const plans: Record<string, "starter" | "pro" | "agency"> = {
      [process.env.STRIPE_PRICE_STARTER || "__missing_starter__"]: "starter",
      [process.env.STRIPE_PRICE_PRO || "__missing_pro__"]: "pro",
      [process.env.STRIPE_PRICE_AGENCY || "__missing_agency__"]: "agency",
    };
    const plan = priceId ? plans[priceId] : undefined;
    if (plan && typeof subscription.customer === "string") {
      const status = event.type === "customer.subscription.deleted" ? "suspended" : subscription.status === "active" || subscription.status === "trialing" ? "active" : subscription.status === "past_due" || subscription.status === "unpaid" ? "past_due" : "suspended";
      const { error } = await supabase.rpc("sync_workspace_subscription", {
        p_customer_id: subscription.customer, p_subscription_id: subscription.id, p_plan: plan,
        p_status: status, p_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      });
      if (error) {
        console.error(`Could not sync workspace subscription ${subscription.id}: ${error.message}`);
        return NextResponse.json({ error: "Could not record subscription." }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ received: true });
}
