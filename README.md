# Settle: invoice follow-up automation

Settle is a Next.js App Router dashboard for tracking invoices, configuring dunning workflows, syncing billing data, and collecting payments through public Stripe Checkout pages.

## Demo walkthrough

Run `npm install` and then `npm run dev`, then open `http://localhost:3000`. The landing page links to a seeded dashboard with sample invoices. **Product preview** demonstrates example Starter, Pro, and Agency plans, a trial, usage meters, ROI/recovery metrics, payment installments, reply detection, white-label pages, team roles, multi-currency reporting, a failed-send queue, and guided onboarding. These are illustrative demo features; they do not create subscription charges or send client messages. See [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation boundary and [HELP.md](HELP.md) for the walkthrough.

Run the automated checks with `npm test`; run the production build with `npm run build`.

## Local setup

1. Install dependencies with `npm install`.
2. Create a Supabase project and run `supabase/migrations/001_init.sql`, followed by `supabase/migrations/002_workflows_integrations.sql`.
3. In Supabase Auth, enable Google and/or GitHub sign-in and add `http://localhost:3000/auth/callback` as an allowed redirect URL.
4. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key, service role key, and app URL. Generate `INTEGRATION_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it stable and backed up: changing it makes saved integration credentials unreadable.
5. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for payments and webhooks. The Stripe Connect onboarding flow creates Express accounts; enable Connect and register the webhook endpoint to receive events from connected accounts.
6. Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the Twilio credentials as Supabase Edge Function secrets. The sender address must belong to a verified Resend domain.
7. Start the app with `npm run dev`.

To test Stripe webhooks locally, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy its signing secret to `STRIPE_WEBHOOK_SECRET`.

## Implemented

- Supabase Auth OAuth and organization-scoped data guarded by row-level security.
- Invoice dashboard with outstanding, recovered, overdue-risk, and average late-payment metrics. Currency totals are shown separately rather than added across currencies.
- Per-invoice reminder pause/resume controls. Pausing automation does not disable the public payment page.
- Editable five-step reminder workflow with day offsets, email/SMS channel, message templates, and one-click polite/firm/formal copy presets. Presets are built-in templates; AI text generation is not configured.
- Stripe and QuickBooks invoice imports. Provider credentials are encrypted at rest using AES-256-GCM; imports are idempotent per organization/provider/external invoice ID.
- Stripe Connect Express onboarding and connected-account Checkout, plus public payment pages and Stripe webhook payment updates.
- Supabase Edge Function for scheduled email and SMS reminders with per-delivery logging and explicit error reporting.

## Sync and automation notes

- Invoice imports are currently started manually from **Dashboard → Integrations**. Stripe sync imports open and paid invoices; QuickBooks sync imports open and paid invoices. QuickBooks access tokens must be refreshed by the account owner when they expire.
- To enable daily reminders, deploy `supabase/functions/daily-dunning` and set `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` as Edge Function secrets. Enable `pg_cron` and `pg_net`, then schedule the `daily-dunning` Edge Function using the SQL example in `supabase/migrations/001_init.sql`. Store the function authorization secret outside source control.
- The workflow editor changes the workspace's default reminder sequence. The daily job skips paid, void, and paused invoices and advances a step only after successful delivery.
- Stripe webhooks must include connected-account events for payments created through Connect. For production, verify the webhook endpoint's connected-account event configuration and test onboarding, checkout, refunds, and failed deliveries.
- QuickBooks OAuth consent/refresh, automatic scheduled provider sync, detailed recovered-funds attribution, and multi-sequence assignment are not included in this MVP.

## Security and operations

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, the encryption key, or provider credentials in client code.
- Existing integration secrets created before migration `002` are plaintext and cannot be decrypted by the new credential manager. Re-enter those credentials in the Integrations page after deploying the migration.
- Back up `INTEGRATION_ENCRYPTION_KEY` securely; there is no automated key rotation or re-encryption flow yet.
