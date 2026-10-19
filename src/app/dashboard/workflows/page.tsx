import { supabaseServer } from "@/lib/supabase/server";
import { saveWorkflow } from "./actions";
import { TonePresetControl } from "./TonePresetControl";
import { DemoWorkflow } from "./DemoWorkflow";
import { AppNav } from "../AppNav";

const fallback = [
  { day_offset: 1, channel: "email", subject: "Quick reminder: invoice due", body: "Hi {{client}}, a friendly nudge that {{amount}} is now past due. Pay in one click: {{pay_link}}" },
  { day_offset: 5, channel: "email", subject: "Invoice 5 days overdue", body: "Hi {{client}}, {{amount}} is now 5 days overdue. Please settle it here: {{pay_link}}" },
  { day_offset: 10, channel: "sms", subject: null, body: "{{client}}: {{amount}} is 10 days overdue. Pay now: {{pay_link}}" },
];

export default async function Workflows({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const params = await searchParams;
  const sb = await supabaseServer();
  if (!sb) {
    return (
      <main className="app-inner">
        <AppNav active="workflows" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/dashboard" className="text-sm text-teal">← Back to invoices</a>
            <h1 className="mt-3 text-3xl font-semibold">Reminder workflow</h1>
            <p className="mt-2 text-ink/60">Set the cadence, voice, and message used for your overdue invoices.</p>
          </div>
          <a href="/dashboard/integrations" className="rounded-lg border border-ink/15 px-4 py-2 text-sm">Integrations</a>
        </header>
        <DemoWorkflow />
      </main>
    );
  }
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  const { data: membership, error: membershipError } = user
    ? await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle()
    : { data: null, error: null };
  if (membershipError) throw new Error(`Could not load your workspace: ${membershipError.message}`);
  const { data: sequence, error: sequenceError } = membership
    ? await sb.from("sequences").select("id, name, tone").eq("org_id", membership.org_id).eq("is_default", true).maybeSingle()
    : { data: null, error: null };
  if (sequenceError) throw new Error(`Could not load your workflow: ${sequenceError.message}`);
  const { data: savedSteps, error: stepsError } = sequence
    ? await sb.from("sequence_steps").select("*").eq("sequence_id", sequence.id).order("position")
    : { data: null, error: null };
  if (stepsError) throw new Error(`Could not load workflow steps: ${stepsError.message}`);
  const steps = savedSteps?.length ? savedSteps : fallback;

  return (
    <main className="app-inner">
      <AppNav active="workflows" />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/dashboard" className="text-sm text-teal">← Back to invoices</a>
          <h1 className="mt-3 text-3xl font-semibold">Reminder workflow</h1>
          <p className="mt-2 text-ink/60">Set the cadence, voice, and message used for your overdue invoices.</p>
        </div>
        <a href="/dashboard/integrations" className="rounded-lg border border-ink/15 px-4 py-2 text-sm">Integrations</a>
      </header>

      {params.error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.error}</p>}
      {params.saved && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Workflow saved. New reminders will use these steps.</p>}

      {!sequence ? (
        <p className="mt-8 rounded-xl border border-ink/10 bg-white p-6">No default workflow was found for this workspace. Please check your database setup or contact support.</p>
      ) : (
        <form id="workflow-form" action={saveWorkflow} className="mt-8">
          <section className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5 sm:grid-cols-2">
            <label className="text-sm font-medium">Workflow name
              <input name="name" defaultValue={sequence.name} maxLength={100} required className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
            </label>
            <div>
              <label htmlFor="workflow-tone" className="text-sm font-medium">Tone profile</label>
              <TonePresetControl initialTone={sequence.tone} formId="workflow-form" />
            </div>
          </section>

          <ol className="mt-5 space-y-3">
            {Array.from({ length: 5 }, (_, index) => {
              const position = index + 1;
              const step = steps[index];
              return (
                <li key={position} className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5 lg:grid-cols-[130px_170px_1fr]">
                  <label className="text-sm font-medium">Day overdue
                    <input name={`day_${position}`} type="number" min="0" max="365" defaultValue={step?.day_offset ?? ""} placeholder="Not scheduled" className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
                  </label>
                  <label className="text-sm font-medium">Channel
                    <select name={`channel_${position}`} defaultValue={step?.channel ?? "email"} className="mt-2 block w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-normal">
                      <option value="email">Email</option><option value="sms">SMS</option>
                    </select>
                  </label>
                  <div className="grid gap-3">
                    <label className="text-sm font-medium">Email subject <span className="font-normal text-ink/45">(leave blank for SMS)</span>
                      <input name={`subject_${position}`} defaultValue={step?.subject ?? ""} maxLength={200} className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
                    </label>
                    <label className="text-sm font-medium">Message
                      <textarea name={`body_${position}`} defaultValue={step?.body ?? ""} maxLength={4000} rows={3} placeholder="Leave the day empty to remove this step." className="mt-2 block w-full rounded-lg border border-ink/15 px-3 py-2 font-normal" />
                    </label>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-sm text-ink/60">Template variables: <code>{"{{client}}"}</code>, <code>{"{{amount}}"}</code>, <code>{"{{pay_link}}"}</code>. Messages are sent only when the invoice is overdue and automation is not paused.</p>
          <button className="mt-5 rounded-lg bg-teal px-5 py-3 font-medium text-white">Save workflow</button>
        </form>
      )}
    </main>
  );
}
