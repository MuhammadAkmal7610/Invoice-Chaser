"use client";

import { useState } from "react";

type Tone = "polite" | "firm" | "formal";
type Preset = { subject: string; body: string };

const presets: Record<Tone, Preset[]> = {
  polite: [
    { subject: "A friendly reminder about your invoice", body: "Hi {{client}}, we hope you're doing well. A friendly reminder that {{amount}} is past due. You can pay securely here: {{pay_link}} Thank you for working with us." },
    { subject: "Following up on your outstanding invoice", body: "Hi {{client}}, we're following up as {{amount}} is still outstanding. When you have a moment, please take care of it here: {{pay_link}} Let us know if you have any questions." },
    { subject: "Checking in about your invoice", body: "Hi {{client}}, we wanted to check in about {{amount}}. Please use this secure link to pay: {{pay_link}} If you've already paid, thank you and please disregard this note." },
    { subject: "A quick note about your balance", body: "Hi {{client}}, just checking in on the remaining balance of {{amount}}. You can settle it here: {{pay_link}} Please reach out if you need anything from us." },
    { subject: "Final friendly follow-up", body: "Hi {{client}}, this is our final scheduled reminder about {{amount}}. Please pay securely here: {{pay_link}} Contact us if you have questions or believe this was sent in error." },
  ],
  firm: [
    { subject: "Payment requested: overdue invoice", body: "Hi {{client}}, {{amount}} is past due and requires your attention. Please arrange payment now: {{pay_link}} Contact us promptly if there is an issue." },
    { subject: "Action required: outstanding balance", body: "Hi {{client}}, our records show {{amount}} remains unpaid. Please settle the balance here: {{pay_link}} If payment has already been sent, reply with the details." },
    { subject: "Immediate attention requested for overdue invoice", body: "Hi {{client}}, payment of {{amount}} is still outstanding. Please use this secure link to resolve the balance: {{pay_link}} Contact us today if you dispute the invoice." },
    { subject: "Please resolve your overdue balance", body: "Hi {{client}}, {{amount}} remains unpaid despite our previous reminders. Please make payment here: {{pay_link}} or contact us to discuss the account." },
    { subject: "Final payment reminder", body: "Hi {{client}}, this is our final scheduled reminder for {{amount}}. Please pay here: {{pay_link}} or contact us immediately if you believe the balance is incorrect." },
  ],
  formal: [
    { subject: "Formal notice: outstanding invoice", body: "Dear {{client}}, this notice concerns the overdue balance of {{amount}}. Please remit payment using the secure link: {{pay_link}} Contact us if you dispute this invoice." },
    { subject: "Formal payment reminder", body: "Dear {{client}}, our records indicate that {{amount}} remains outstanding. Please arrange payment promptly: {{pay_link}} For questions regarding this balance, contact our office." },
    { subject: "Notice of overdue balance", body: "Dear {{client}}, payment of {{amount}} is overdue. Please remit the outstanding amount through this secure link: {{pay_link}} Notify us promptly of any dispute." },
    { subject: "Further notice: unpaid invoice", body: "Dear {{client}}, {{amount}} remains unpaid following prior notices. Please resolve this balance: {{pay_link}} Contact our office if you require clarification." },
    { subject: "Final scheduled notice of outstanding balance", body: "Dear {{client}}, this is the final scheduled notice regarding {{amount}}. Please submit payment here: {{pay_link}} or contact our office if you dispute this balance." },
  ],
};

export function TonePresetControl({ initialTone, formId }: { initialTone: string; formId: string }) {
  const [tone, setTone] = useState<Tone>(initialTone === "firm" || initialTone === "formal" ? initialTone : "polite");

  function applyPreset() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) throw new Error("Workflow form could not be found.");
    for (let index = 0; index < presets[tone].length; index++) {
      const position = index + 1;
      const day = form.elements.namedItem(`day_${position}`);
      if (!(day instanceof HTMLInputElement) || !day.value.trim()) continue;
      const subject = form.elements.namedItem(`subject_${position}`);
      const body = form.elements.namedItem(`body_${position}`);
      if (subject instanceof HTMLInputElement) subject.value = presets[tone][index].subject;
      if (body instanceof HTMLTextAreaElement) body.value = presets[tone][index].body;
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <select id="workflow-tone" name="tone" value={tone} onChange={(event) => setTone(event.target.value as Tone)} className="mt-2 block w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-normal">
        <option value="polite">Polite partnership</option>
        <option value="firm">Firm and professional</option>
        <option value="formal">Formal notice</option>
      </select>
      <button type="button" onClick={applyPreset} className="mt-2 rounded-lg border border-ink/20 px-3 py-2 text-sm font-medium">Apply tone copy</button>
    </div>
  );
}
