import { supabaseServer } from "@/lib/supabase/server";
import { addInvoice, setPaused } from "./actions";
import demoData from "@/lib/demo-data.json";
import { DashboardView } from "./view";

export default async function Dashboard() {
  const sb = await supabaseServer();
  let invoices = demoData.invoices;
  if (sb) {
    const { data, error } = await sb.from("invoices").select("*").order("due_date");
    if (error) throw new Error(`Could not load invoices: ${error.message}`);
    invoices = data ?? [];
  }
  return <DashboardView initialInvoices={invoices} demo={!sb} addInvoiceAction={addInvoice} setPausedAction={setPaused} supportEmail={process.env.SUPPORT_EMAIL || "hello@settle.app"} />;
}
