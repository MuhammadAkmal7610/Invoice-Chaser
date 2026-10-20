import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const sb = await supabaseServer();
  if (!sb) return NextResponse.redirect(new URL("/dashboard/billing?error=not_configured", origin), 303);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin), 303);
  const { data: membership } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  const { data: org } = membership ? await sb.from("organizations").select("stripe_customer_id").eq("id", membership.org_id).maybeSingle() : {data:null};
  if (!stripeKey || !org?.stripe_customer_id) return NextResponse.redirect(new URL("/dashboard/billing?error=not_configured", origin), 303);
  const session = await new Stripe(stripeKey).billingPortal.sessions.create({customer: org.stripe_customer_id, return_url: `${origin}/dashboard/billing`});
  return NextResponse.redirect(session.url, 303);
}
