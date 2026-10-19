import { supabaseServer } from "@/lib/supabase/server";
import { saveIntegration, startStripeConnect, syncIntegration } from "./actions";
import { AppNav } from "../AppNav";

export default async function Integrations({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; synced?: string; connect?: string }> }) {
  const params = await searchParams;
  const sb = await supabaseServer();
  if (!sb) {
    return (
      <main className="app-inner">
        <AppNav active="integrations" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/dashboard" className="text-sm text-teal">← Back to invoices</a>
            <h1 className="mt-3 text-3xl font-semibold">Integration hub</h1>
            <p className="mt-2 text-ink/60">Connect your billing source and import invoices into your workspace.</p>
          </div>
          <a href="/dashboard/workflows" className="rounded-lg border border-ink/15 px-4 py-2 text-sm">Workflows</a>
        </header>
        <p role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Demo mode: billing integrations are unavailable until Supabase is connected.
        </p>
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {["Stripe", "QuickBooks Online"].map((provider) => (
            <article key={provider} className="rounded-2xl border border-ink/10 bg-white p-6">
              <h2 className="text-xl font-semibold">{provider}</h2>
              <p className="mt-2 text-sm text-ink/60">Connect Supabase to securely save credentials and sync invoices.</p>
              <span className="mt-4 inline-block rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/60">Unavailable in demo mode</span>
            </article>
          ))}
        </section>
      </main>
    );
  }
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  const { data: membership, error: membershipError } = user
    ? await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle()
    : { data: null, error: null };
  if (membershipError) throw new Error(`Could not load your workspace: ${membershipError.message}`);
  const { data: integrations, error: integrationsError } = membership
    ? await sb.from("integrations").select("provider, secret, account_id, updated_at").eq("org_id", membership.org_id)
    : { data: null, error: null };
  if (integrationsError) throw new Error(`Could not load your integrations: ${integrationsError.message}`);
  const { data: syncs, error: syncsError } = membership
    ? await sb.from("integration_syncs").select("provider, status, imported_count, error, created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }).limit(8)
    : { data: null, error: null };
  if (syncsError) throw new Error(`Could not load sync history: ${syncsError.message}`);
  const hasCredentials = (provider: string) =>
    (integrations ?? []).some((integration) => integration.provider === provider && integration.secret?.startsWith("v1:"));
  const hasStripeAccount = (integrations ?? []).some((integration) => integration.provider === "stripe" && integration.account_id);
  const connectMessage = params.connect === "return"
    ? "Stripe onboarding returned successfully. Stripe will confirm account capabilities before accepting payments."
    : params.connect === "refresh" ? "Stripe onboarding needs to be continued. Start setup again below." : null;

  return (
    <main className="app-inner">
      <AppNav active="integrations" />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/dashboard" className="text-sm text-teal">← Back to invoices</a>
          <h1 className="mt-3 text-3xl font-semibold">Integration hub</h1>
          <p className="mt-2 text-ink/60">Connect your billing source and import invoices into your workspace.</p>
        </div>
        <a href="/dashboard/workflows" className="rounded-lg border border-ink/15 px-4 py-2 text-sm">Workflows</a>
      </header>

      {params.error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.error}</p>}
      {params.saved && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{params.saved === "stripe" ? "Stripe" : "QuickBooks"} credentials saved securely.</p>}
      {params.synced !== undefined && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Sync complete: {params.synced} invoices imported or updated.</p>}
      {connectMessage && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{connectMessage}</p>}

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink/10 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold">Stripe</h2><p className="mt-1 text-sm text-ink/60">Import open and paid invoices from your Stripe account.</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${hasCredentials("stripe") ? "bg-emerald-50 text-emerald-800" : "bg-ink/5 text-ink/60"}`}>{hasCredentials("stripe") ? "Sync key saved" : "No sync key"}</span>
          </div>
          <form action={saveIntegration} className="mt-5">
            <input type="hidden" name="provider" value="stripe" />
            <label className="text-sm font-medium">Stripe secret API key
              <input name="stripe_key" type="password" autoComplete="new-password" placeholder="sk_live_..." required className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
            </label>
            <p className="mt-2 text-xs text-ink/50">Credentials are encrypted before storage and never shown again. We need read access to invoices.</p>
            <button className="mt-4 rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium">Save Stripe credentials</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={startStripeConnect}><button className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium">{hasStripeAccount ? "Continue Stripe onboarding" : "Connect Stripe for payments"}</button></form>
            {hasCredentials("stripe") && <form action={syncIntegration}><input type="hidden" name="provider" value="stripe" /><button className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white">Sync Stripe invoices</button></form>}
          </div>
          <p className="mt-2 text-xs text-ink/50">Payment onboarding uses Stripe Connect. Invoice importing uses a separate encrypted API key.</p>
        </article>

        <article className="rounded-2xl border border-ink/10 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold">QuickBooks Online</h2><p className="mt-1 text-sm text-ink/60">Import open and paid invoices for your company.</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${hasCredentials("quickbooks") ? "bg-emerald-50 text-emerald-800" : "bg-ink/5 text-ink/60"}`}>{hasCredentials("quickbooks") ? "Credentials saved" : "Not connected"}</span>
          </div>
          <form action={saveIntegration} className="mt-5 space-y-3">
            <input type="hidden" name="provider" value="quickbooks" />
            <label className="block text-sm font-medium">OAuth access token
              <input name="qb_access_token" type="password" autoComplete="new-password" placeholder="Access token" required className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Company ID (realm ID)
              <input name="qb_realm_id" autoComplete="off" placeholder="Company realm ID" required className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
            </label>
            <p className="text-xs text-ink/50">Use a QuickBooks Online OAuth token with invoice read access. Tokens may expire; replace them here when needed.</p>
            <button className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium">Save QuickBooks credentials</button>
          </form>
          {hasCredentials("quickbooks") && <form action={syncIntegration} className="mt-3"><input type="hidden" name="provider" value="quickbooks" /><button className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white">Sync QuickBooks invoices</button></form>}
        </article>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent syncs</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          {!syncs?.length ? <p className="p-5 text-sm text-ink/60">Your sync history will appear here.</p> : (
            <ul className="divide-y divide-ink/10">
              {syncs.map((sync, index) => <li key={`${sync.provider}-${sync.created_at}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                <div><span className="font-medium">{sync.provider === "stripe" ? "Stripe" : "QuickBooks"}</span><span className="ml-2 text-ink/60">{sync.status === "success" ? `${sync.imported_count} imported / updated` : sync.error || "Sync failed"}</span></div>
                <time className="text-ink/50">{new Date(sync.created_at).toLocaleString()}</time>
              </li>)}
            </ul>
          )}
        </div>
      </section>
      <p className="mt-6 text-xs text-ink/45">Data sync runs on demand. To enable daily automation, deploy the Supabase Edge Function and configure Supabase Cron as described in the setup guide.</p>
    </main>
  );
}
