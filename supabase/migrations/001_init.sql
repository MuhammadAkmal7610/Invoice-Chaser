-- Multi-tenant core. Every row hangs off an organization; RLS isolates tenants.
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table memberships (
  org_id uuid references organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'owner',
  primary key (org_id, user_id)
);
create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  provider text not null check (provider in ('stripe','quickbooks')),
  secret text not null, -- encrypt with Supabase Vault before production
  unique (org_id, provider)
);
create table sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  tone text not null default 'polite' check (tone in ('polite','firm','formal')),
  is_default boolean default false
);
create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences on delete cascade,
  position int not null,
  day_offset int not null,                -- days past due
  channel text not null check (channel in ('email','sms')),
  subject text,
  body text not null                      -- supports {{client}}, {{amount}}, {{pay_link}}
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  external_id text,
  client_name text not null,
  client_email text,
  client_phone text,
  amount_cents int not null,
  currency text not null default 'usd',
  due_date date not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  paused boolean not null default false,
  pay_token uuid not null default gen_random_uuid() unique,
  current_step int not null default 0,
  paid_at timestamptz,
  created_at timestamptz default now()
);
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete cascade,
  step_id uuid references sequence_steps,
  channel text, status text, sent_at timestamptz default now()
);

create or replace function is_member(o uuid) returns boolean language sql security definer stable as
$$ select exists (select 1 from memberships where org_id = o and user_id = auth.uid()) $$;

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table integrations enable row level security;
alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table invoices enable row level security;
alter table reminder_log enable row level security;

create policy org_read on organizations for select using (is_member(id));
create policy mem_read on memberships for select using (user_id = auth.uid());
create policy int_all on integrations for all using (is_member(org_id)) with check (is_member(org_id));
create policy seq_all on sequences for all using (is_member(org_id)) with check (is_member(org_id));
create policy step_all on sequence_steps for all
  using (exists (select 1 from sequences s where s.id = sequence_id and is_member(s.org_id)));
create policy inv_all on invoices for all using (is_member(org_id)) with check (is_member(org_id));
create policy log_read on reminder_log for select
  using (exists (select 1 from invoices i where i.id = invoice_id and is_member(i.org_id)));

-- On signup: create an org, membership, and a default 3-step sequence.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare o uuid; s uuid;
begin
  insert into public.organizations (name) values (coalesce(split_part(new.email,'@',1),'My agency')) returning id into o;
  insert into public.memberships (org_id, user_id) values (o, new.id);
  insert into public.sequences (org_id, name, is_default) values (o, 'Default follow-up', true) returning id into s;
  insert into public.sequence_steps (sequence_id, position, day_offset, channel, subject, body) values
   (s,1,1,'email','Quick reminder: invoice due','Hi {{client}}, a friendly nudge that {{amount}} is now past due. Pay in one click: {{pay_link}}'),
   (s,2,5,'email','Invoice 5 days overdue','Hi {{client}}, {{amount}} is now 5 days overdue. Please settle it here: {{pay_link}}'),
   (s,3,10,'sms',null,'{{client}}: {{amount}} is 10 days overdue. Pay now: {{pay_link}}');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Nightly run (enable pg_cron + pg_net, then set your project URL and key):
-- select cron.schedule('daily-dunning','0 0 * * *', $$ select net.http_post(
--   url := 'https://<project>.supabase.co/functions/v1/daily-dunning',
--   headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb) $$);
