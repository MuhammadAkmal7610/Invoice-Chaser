# Settle help

## Explore the demo

Open the landing page and choose **Explore the live demo**, or visit `/dashboard`. Demo invoices are read from `src/lib/demo-data.json`. You can search, filter, add sample invoices, pause sample reminders, and mark sample invoices paid in the current browser session.

Visit **Product preview** for illustrative plan tiers and usage, sample MRR/churn/recovery metrics, payment-plan calculations, reply detection, agency branding, roles, failed-delivery retries, and onboarding. These controls demonstrate intended product behavior and do not contact clients or charge a payment method.

## Connect a Supabase workspace

Follow the local setup and environment variable instructions in `README.md`. Apply both SQL migrations in order. Configure Stripe Connect and a webhook before using real client payments. Configure Resend, Twilio, and the daily-dunning Edge Function before sending reminders.

## Troubleshooting

- **Sign-in unavailable:** check `NEXT_PUBLIC_SUPABASE_URL` and the public anon/publishable key.
- **Payment page unavailable:** configure Supabase service access, Stripe secret credentials, and connected-account onboarding.
- **No reminders are sent:** deploy `supabase/functions/daily-dunning` and set its Resend/Twilio secrets and `APP_URL`.
- **Uptime check:** request `GET /api/health`; it returns a JSON `status` field.

For help, contact `hello@settle.app`.
