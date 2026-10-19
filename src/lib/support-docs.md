Settle support reference

Settle helps agencies follow up on overdue invoices with scheduled email and SMS reminders and Stripe Checkout payment pages.

Connecting billing sources:
- Open Dashboard > Integrations. Stripe invoice imports use a Stripe secret API key. Stripe payment collection uses the separate Stripe Connect onboarding button. Save the key, then choose Sync Stripe invoices. Sync is on demand.
- QuickBooks imports use an OAuth access token and company realm ID. Save credentials, then choose Sync QuickBooks invoices. Sync is on demand. The account owner must replace expired QuickBooks tokens.
- Credentials are encrypted before storage and are not shown again after saving.

Reminder workflows:
- Open Dashboard > Workflows to edit the workspace default sequence. Configure up to five steps, day offsets, email or SMS channels, subjects, and message templates. Leave a step's day empty to remove it.
- Tone presets provide built-in polite, firm, and formal message copy. Choose a tone and Apply tone copy, then review and Save workflow. The copy presets are not AI-generated.
- Supported template variables are {{client}}, {{amount}}, and {{pay_link}}.
- An invoice's Pause automation control stops reminders for that invoice. Resume automation starts them again. Pausing reminders does not disable the public payment page.

Reminder delivery:
- The daily-dunning Supabase Edge Function skips invoices that are paid, void, paused, or not yet due. It sends a step only when that step's day offset has arrived. It advances the invoice step only after successful delivery.
- Email requires the invoice email address plus configured Resend secrets and verified sender address. SMS requires a client phone number plus configured Twilio secrets.
- The Edge Function, its secrets, pg_cron/pg_net schedule, and APP_URL must be configured for daily automated reminders. If a reminder did not send, check invoice status, pause state, due date, workflow step/channel, contact details, and deployment/secrets.
- Delivery attempts are written to reminder_log with channel, status, and timestamp. The current dashboard does not show a detailed failed-send queue in real workspaces.

Payments:
- The public pay page is opened from the invoice's unique payment link and requires no client login. Payment uses Stripe Checkout on the agency's connected account.
- After Checkout, payment status updates when the signed Stripe webhook event arrives. If a page still shows open, verify that Checkout completed and the webhook endpoint is configured to receive connected-account events; status may remain open while the webhook is pending or misconfigured.
- The current live payment flow supports full invoice payment. Installments and partial payments are only a demo preview.

Other boundaries:
- Subscription plans, plan changes, free trials, usage metering, inbound reply detection, custom payment domains, live white-label settings, team role enforcement, and manager notifications are not implemented as live features. Product Preview values and controls are examples only.
- Support can explain fields and records included in the current account context, but cannot change, pause, send, or delete account data.
