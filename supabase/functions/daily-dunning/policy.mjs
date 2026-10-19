export function isEligibleInvoice(invoice, today) {
  return invoice.status === "open" && !invoice.paused && invoice.due_date <= today;
}

export function selectNextStep(steps, currentPosition, daysLate) {
  return steps
    .filter((step) => step.position > currentPosition && step.day_offset <= daysLate)
    .sort((a, b) => a.position - b.position)[0] ?? null;
}

export function fillTemplate(template, values) {
  return template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? "");
}
