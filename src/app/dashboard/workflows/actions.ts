"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const fail = (message: string): never => redirect(`/dashboard/workflows?error=${encodeURIComponent(message)}`);

export async function saveWorkflow(form: FormData) {
  const sb = await supabaseServer();
  if (!sb) return fail("Supabase is not configured. Add your project URL and anon key to the environment.");
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return fail("Please sign in again to edit your workflow.");
  const { data: membership, error: membershipError } = await sb.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (membershipError || !membership) return fail("Could not find your agency workspace.");
  const { data: sequence, error: sequenceError } = await sb.from("sequences").select("id").eq("org_id", membership.org_id).eq("is_default", true).maybeSingle();
  if (sequenceError || !sequence) return fail("Your default workflow is unavailable.");

  const name = String(form.get("name") ?? "").trim();
  const tone = String(form.get("tone") ?? "");
  if (!name || name.length > 100 || !["polite", "firm", "formal"].includes(tone)) {
    return fail("Enter a workflow name and choose a valid tone.");
  }

  const steps = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    const dayValue = String(form.get(`day_${position}`) ?? "").trim();
    const body = String(form.get(`body_${position}`) ?? "").trim();
    const channel = String(form.get(`channel_${position}`) ?? "email");
    const subject = String(form.get(`subject_${position}`) ?? "").trim();
    if (!dayValue && !body && !subject) return null;
    const day = Number(dayValue);
    if (!Number.isInteger(day) || day < 0 || day > 365 || !body || !["email", "sms"].includes(channel)) {
      return fail(`Step ${position} needs a day from 0 to 365, a message, and a valid channel.`);
    }
    if (channel === "email" && !subject) return fail(`Step ${position} needs an email subject.`);
    if (body.length > 4000 || subject.length > 200) return fail(`Step ${position} exceeds the message length limit.`);
    return { position, day_offset: day, channel, subject: channel === "email" ? subject : null, body };
  }).filter((step): step is NonNullable<typeof step> => step !== null);

  if (steps.length === 0) return fail("Add at least one reminder step.");
  if (new Set(steps.map((step) => step.day_offset)).size !== steps.length) {
    return fail("Each reminder step must use a different day after the due date.");
  }
  steps.sort((a, b) => a.day_offset - b.day_offset);
  steps.forEach((step, index) => { step.position = index + 1; });

  const { error: stepsError } = await sb.rpc("save_sequence_steps", {
    p_sequence_id: sequence.id,
    p_steps: steps,
    p_sequence_name: name,
    p_tone: tone,
  });
  if (stepsError) return fail(`Could not save reminder steps: ${stepsError.message}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/workflows");
  redirect("/dashboard/workflows?saved=1");
}
