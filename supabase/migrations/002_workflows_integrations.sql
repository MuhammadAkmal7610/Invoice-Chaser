create table if not exists integration_syncs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  provider text not null check (provider in ('stripe', 'quickbooks')),
  status text not null check (status in ('success', 'failed')),
  imported_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

alter table integrations add column if not exists account_id text;
alter table integrations alter column secret drop not null;
alter table invoices add column if not exists source_provider text not null default 'manual'
  check (source_provider in ('manual', 'stripe', 'quickbooks'));
drop index if exists invoices_org_external_id_unique;
create unique index if not exists invoices_org_provider_external_id_unique
  on invoices (org_id, source_provider, external_id);

alter table integration_syncs enable row level security;
create policy integration_sync_read on integration_syncs for select using (is_member(org_id));
create policy integration_sync_insert on integration_syncs for insert with check (is_member(org_id));

create unique index if not exists sequence_steps_sequence_position_unique
  on sequence_steps (sequence_id, position);
create index if not exists invoices_open_due_date_idx on invoices (due_date) where status = 'open';
create index if not exists reminder_log_invoice_sent_idx on reminder_log (invoice_id, sent_at desc);

create or replace function save_sequence_steps(p_sequence_id uuid, p_steps jsonb, p_sequence_name text, p_tone text)
returns void language plpgsql security invoker as $$
begin
  if not is_member((select org_id from sequences where id = p_sequence_id)) then
    raise exception 'Sequence not found or access denied';
  end if;
  if coalesce(jsonb_typeof(p_steps), 'null') <> 'array' then
    raise exception 'Workflow steps must be an array';
  end if;
  if jsonb_array_length(p_steps) = 0 then
    raise exception 'At least one workflow step is required';
  end if;
  if coalesce(trim(p_sequence_name), '') = '' or length(p_sequence_name) > 100
     or coalesce(p_tone, '') not in ('polite', 'firm', 'formal') then
    raise exception 'Invalid workflow name or tone';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_steps) step
    where coalesce(step->>'position', '') !~ '^[0-9]+$'
       or coalesce(step->>'day_offset', '') !~ '^[0-9]+$'
       or (step->>'position')::integer < 1
       or (step->>'day_offset')::integer < 0
       or (step->>'day_offset')::integer > 365
       or step->>'channel' not in ('email', 'sms')
       or coalesce(step->>'body', '') = ''
       or (step->>'channel' = 'email' and coalesce(step->>'subject', '') = '')
  ) then
    raise exception 'Workflow contains an invalid reminder step';
  end if;
  if (select count(distinct (step->>'day_offset')::integer) from jsonb_array_elements(p_steps) step)
      <> jsonb_array_length(p_steps) then
    raise exception 'Workflow steps must use distinct day offsets';
  end if;
  update sequences set name = trim(p_sequence_name), tone = p_tone where id = p_sequence_id;
  delete from sequence_steps where sequence_id = p_sequence_id;
  insert into sequence_steps (sequence_id, position, day_offset, channel, subject, body)
  select p_sequence_id, (step->>'position')::integer, (step->>'day_offset')::integer,
         step->>'channel', nullif(step->>'subject', ''), step->>'body'
  from jsonb_array_elements(p_steps) step;
end;
$$;

-- Integration secrets are AES-256-GCM ciphertext produced by the server.
-- Existing plaintext credentials must be re-entered after deploying this migration.
alter table integrations add column if not exists updated_at timestamptz not null default now();
