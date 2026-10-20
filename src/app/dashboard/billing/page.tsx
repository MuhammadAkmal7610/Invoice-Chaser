import { redirect } from "next/navigation";
import { AppNav } from "../AppNav";
import { supabaseServer } from "@/lib/supabase/server";

export default async function BillingPage() {
  const sb = await supabaseServer();
  if (!sb) return <main className="app-inner"><AppNav active="billing"/><header><h1>Plan & billing</h1><p>Connect Supabase to manage a workspace subscription.</p></header></main>;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await sb.from("memberships").select("org_id,role").eq("user_id", user.id).limit(1).maybeSingle();
  const { data: org } = membership ? await sb.from("organizations").select("name,plan,status,current_period_end,stripe_customer_id").eq("id", membership.org_id).maybeSingle() : {data:null};
  return <main className="app-inner"><AppNav active="billing"/><header><a href="/dashboard">← Back to overview</a><h1>Plan & billing</h1><p>Manage the subscription and service status for your workspace.</p></header>
    <section className="billing-panel"><div><span className="billing-kicker">CURRENT WORKSPACE</span><h2>{org?.name ?? "Workspace"}</h2><p>{org?.status ?? "active"} · {org?.plan ?? "starter"} plan</p></div><div className="billing-detail"><span>Plan</span><b>{(org?.plan ?? "starter").toUpperCase()}</b></div><div className="billing-detail"><span>Account status</span><b>{org?.status ?? "active"}</b></div><div className="billing-detail"><span>Renewal</span><b>{org?.current_period_end ? new Date(org.current_period_end).toLocaleDateString() : "No renewal scheduled"}</b></div>
      <form action="/api/billing/portal" method="post"><button className="billing-button" type="submit" disabled={!org?.stripe_customer_id}>Open billing portal</button></form><small>{org?.stripe_customer_id ? "Update payment method, view invoices, or cancel in Stripe." : "Subscription billing is not connected yet. Configure Stripe prices to enable checkout."}</small>
    </section></main>;
}
