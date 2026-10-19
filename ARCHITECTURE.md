# Settle architecture

Settle is a Next.js App Router application. Server components read workspace data through Supabase's cookie-aware client. Tenant access is enforced by PostgreSQL row-level security and the `is_member(org_id)` helper. Server actions mutate invoices and workflows within the signed-in workspace.

## Main paths

- `src/app/` contains the public landing page, login, dashboard, workflow editor, integrations, public payment page, and Stripe endpoints.
- `src/lib/supabase/` creates browser and server Supabase clients. Admin access is server-only and reserved for public payment lookups and verified webhooks.
- `src/lib/integrations.ts` contains encrypted provider credential handling and invoice sync.
- `supabase/migrations/` defines the tenant schema, RLS policies, and workflow persistence.
- `supabase/functions/daily-dunning/` selects due reminder steps and sends email/SMS through Resend and Twilio.
- `src/lib/demo-data.json` seeds the no-credentials walkthrough. Product Studio metrics and plan examples are illustrative and are not live billing records.

## Payment lifecycle

An invoice has an unguessable `pay_token`. Its public page creates a Stripe Checkout session using the agency's connected account. Stripe sends a signed event to `/api/webhooks/stripe`; the handler verifies the signature, checks payment state and connected-account ownership, then marks the invoice paid. The daily reminder function skips paid and paused invoices.

## Operational boundaries

The product preview includes illustrative subscription prices, trial state, MRR, churn, usage, payment installments, reply detection, branding, and delivery retries. These screens do not create charges, send messages, pause live sequences, or persist settings. Production subscription billing, inbound reply webhooks, installment schedules, custom-domain provisioning, error tracking, and live queue retry controls need provider-backed implementations before launch.

`GET /api/health` is a lightweight uptime probe. Configure an external uptime monitor against that URL. CI runs unit and static regression checks plus the production build. The RLS test checks migrations for required tenant guards; it is not a substitute for a live two-tenant Supabase integration test.
