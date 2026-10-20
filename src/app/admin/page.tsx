import { redirect } from "next/navigation";
import { currentPlatformAdmin } from "@/lib/supabase/server";
import { updateWorkspace } from "./actions";

export default async function AdminPage() {
  const { sb, user, isAdmin } = await currentPlatformAdmin();
  if (!user) redirect("/login");
  if (!isAdmin) redirect("/dashboard");
  const admin = (await import("@/lib/supabase/server")).supabaseAdmin();
  const [{ data: orgs, error }, { count: totalInvoices }, { data: audit }] = await Promise.all([
    admin!.from("organizations").select("id,name,plan,status,created_at,current_period_end").order("created_at", { ascending: false }),
    admin!.from("invoices").select("id", { count: "exact", head: true }),
    admin!.from("platform_audit_log").select("id,action,created_at,org_id,details").order("created_at", { ascending: false }).limit(12),
  ]);
  if (error) throw new Error(error.message);
  return <main className="platform-shell"><header className="platform-header"><a href="/dashboard">← Settle</a><span>PLATFORM ADMIN</span></header><section className="platform-intro"><div><small>OPERATOR CONSOLE</small><h1>Workspace control</h1><p>Manage account status and monitor platform activity.</p></div><a href="/dashboard">Open customer workspace →</a></section>
    <section className="platform-metrics"><article><span>Workspaces</span><b>{orgs?.length ?? 0}</b></article><article><span>Invoices tracked</span><b>{totalInvoices ?? 0}</b></article><article><span>Active</span><b>{orgs?.filter((o:any)=>o.status==="active").length ?? 0}</b></article><article><span>Needs attention</span><b>{orgs?.filter((o:any)=>o.status!=="active").length ?? 0}</b></article></section>
    <section className="platform-card"><div className="platform-card-heading"><div><h2>Customer workspaces</h2><p>Search and control access for each tenant.</p></div><span>{orgs?.length ?? 0} accounts</span></div><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>STATUS</th><th>CREATED</th><th>ACCESS CONTROL</th></tr></thead><tbody>{orgs?.map((org:any)=><tr key={org.id}><td><b>{org.name}</b><small>{org.id}</small></td><td>{org.plan}</td><td><span className={`platform-status ${org.status}`}>{org.status}</span></td><td>{new Date(org.created_at).toLocaleDateString()}</td><td><form action={updateWorkspace} className="platform-control"><input type="hidden" name="org_id" value={org.id}/><select aria-label={`Set ${org.name} status`} name="status" defaultValue={org.status}><option value="active">Active</option><option value="past_due">Past due</option><option value="suspended">Suspended</option></select><button>Save</button></form></td></tr>)}</tbody></table></div></section>
    <section className="platform-card"><div className="platform-card-heading"><div><h2>Recent operator actions</h2><p>Changes to account access are recorded here.</p></div></div><div className="platform-audit">{audit?.length ? audit.map((row:any)=><div key={row.id}><span>{row.action.replaceAll("_"," ")}</span><small>{row.org_id ?? "Workspace removed"} · {new Date(row.created_at).toLocaleString()}</small><b>{row.details?.from} → {row.details?.to}</b></div>) : <p>No operator actions recorded yet.</p>}</div></section><footer className="platform-footer">Signed in as {user.email} · <a href="/dashboard/billing">Customer billing view</a></footer></main>;
}
