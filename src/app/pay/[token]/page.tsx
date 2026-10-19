import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import Image from "next/image";

// Public, no-login payment page. Looked up by unguessable token.
export default async function Pay({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const supabase = supabaseAdmin();
  if (!supabase) {
    return (
      <main className="payment-shell"><div className="payment-card"><Image src="/logo.svg" alt="Settle" width={130} height={40}/><span className="payment-check">✓</span><h1>Secure payments are almost ready</h1><p>This payment page is temporarily unavailable. Please contact the agency for another way to pay.</p><small>Securely powered by Settle</small></div></main>
    );
  }
  const { data: inv, error } = await supabase.from("invoices")
    .select("client_name, amount_cents, currency, status").eq("pay_token", token).maybeSingle();
  if (error) throw new Error(`Could not load payment page: ${error.message}`);
  if (!inv) notFound();
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(inv.amount_cents / 100);

  return (
    <main className="payment-shell"><div className="payment-card">
      <Image src="/logo.svg" alt="Settle" width={130} height={40}/><div className="invoice-label">INVOICE PAYMENT</div><p className="text-ink/60">Invoice for {inv.client_name}</p>
      <p className="payment-amount">{amount}</p>
      {inv.status === "paid" ? (
        <p className="font-medium text-teal">This invoice is paid. Thank you.</p>
      ) : inv.status === "void" ? (
        <p className="font-medium text-ink/60">This invoice is no longer payable. Please contact the agency.</p>
      ) : (
        <>
          {query.checkout === "success" && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Payment is processing. This page will update once your payment is confirmed.</p>}
          <form action={`/api/pay/${token}`} method="post">
            <button className="w-full rounded-lg bg-teal px-4 py-3 text-lg text-white">Pay {amount}</button>
          </form>
        </>
      )}
      <small className="payment-secure">▣ &nbsp;Secure payment · Securely powered by Settle</small></div></main>
  );
}
