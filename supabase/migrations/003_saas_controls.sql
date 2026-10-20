-- Workspace subscription state and operator audit log.
alter table organizations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'past_due', 'suspended')),
  add column if not exists plan text not null default 'starter'
    check (plan in ('starter', 'pro', 'agency')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists organizations_stripe_customer_unique
  on organizations (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists organizations_stripe_subscription_unique
  on organizations (stripe_subscription_id) where stripe_subscription_id is not null;

create table if not exists platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
create policy platform_admin_self_read on platform_admins for select using (user_id = auth.uid());

create table if not exists platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users on delete set null,
  org_id uuid references organizations on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table platform_audit_log enable row level security;
create policy platform_audit_admin_read on platform_audit_log for select
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

create or replace function is_platform_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Apply only active/trialing subscriptions. Never trust client-supplied org ids.
create or replace function sync_workspace_subscription(
  p_customer_id text, p_subscription_id text, p_plan text,
  p_status text, p_period_end timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_plan not in ('starter','pro','agency') or p_status not in ('active','past_due','suspended') then
    raise exception 'Invalid subscription state';
  end if;
  update public.organizations set plan=p_plan, status=p_status,
    stripe_subscription_id=p_subscription_id, current_period_end=p_period_end,
    updated_at=now()
  where stripe_customer_id=p_customer_id;
end $$;

-- Add an initial platform operator manually after account creation:
-- insert into public.platform_admins (user_id) select id from auth.users where email='you@example.com';
